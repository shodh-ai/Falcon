/**
 * Apply SQL migrations from backend/migrations/ (sorted by filename).
 *
 * Uses DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE from the environment
 * (same vars as the NestJS app). On a fresh database, base tables are bootstrapped from
 * TypeORM entities before SQL migrations run. Safe to run in Coolify backend terminal:
 *   npm run db:migrate
 *   npm run db:migrate:repair
 *   npm run db:seed
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { run: syncSchema, coreTablesExist } = require('./sync-schema');

/** Load backend/.env so local `npm run db:migrate` uses DB_USERNAME=apple (not postgres). */
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/** Seed-only files (idempotent); run after schema exists via db:migrate. */
const SEED_FILES = [
  '20260529152000_seed_master_test_personas.sql',
  '20260609140000_hr_portal_smoke_seed.sql',
];

/**
 * Known-password DoFA personas are deliberately isolated from normal migrations
 * and ordinary smoke seeds. They may only be installed by the explicit,
 * environment-guarded db:seed:dofa-qa command.
 */
const DOFA_QA_SEED_FILES = ['20260907120000_dofa_qa_personas.seed.sql'];

function dbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };
}

function listSqlFiles(seedMode) {
  const all = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (seedMode === 'migrations') {
    return all
      .filter((name) => !name.endsWith('.seed.sql'))
      .map((name) => path.join(MIGRATIONS_DIR, name));
  }

  const expected = seedMode === 'dofa-qa' ? DOFA_QA_SEED_FILES : SEED_FILES;
  const selected = all.filter((name) => expected.includes(name));
  if (selected.length === 0) {
    throw new Error(`No seed files found. Expected: ${expected.join(', ')}`);
  }
  return selected.map((name) => path.join(MIGRATIONS_DIR, name));
}

function assertDofaQaSeedAllowed() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const databaseEnv = String(
    process.env.DATABASE_ENV || process.env.DEPLOYMENT_ENV || '',
  ).toLowerCase();
  if (process.env.DOFA_QA_SEED_ENABLED !== 'true') {
    throw new Error(
      'Refusing DoFA QA seed: set DOFA_QA_SEED_ENABLED=true explicitly.',
    );
  }
  if (
    nodeEnv === 'production' ||
    databaseEnv === 'production' ||
    databaseEnv === 'prod'
  ) {
    throw new Error(
      'Refusing DoFA QA seed: known-password QA accounts cannot be installed in production.',
    );
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isApplied(client, filename) {
  const res = await client.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename],
  );
  return res.rows.length > 0;
}

async function markApplied(client, filename) {
  await client.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
    [filename],
  );
}

async function resetMigrationLedger(client) {
  await client.query('TRUNCATE schema_migrations');
}

async function run() {
  const seedOnly = process.argv.includes('--seed');
  const dofaQaSeedOnly = process.argv.includes('--dofa-qa-seed');
  if (seedOnly && dofaQaSeedOnly) {
    throw new Error('Choose either --seed or --dofa-qa-seed, not both.');
  }
  if (dofaQaSeedOnly) assertDofaQaSeedAllowed();
  const seedMode = dofaQaSeedOnly
    ? 'dofa-qa'
    : seedOnly
      ? 'standard'
      : 'migrations';
  const forceAll = process.argv.includes('--force');
  const repair = process.argv.includes('--repair');
  const files = listSqlFiles(seedMode);

  const cfg = dbConfig();
  console.log(
    seedMode !== 'migrations'
      ? `Running ${files.length} seed file(s) as ${cfg.user}@${cfg.host}/${cfg.database}...`
      : `Running ${files.length} migration(s) as ${cfg.user}@${cfg.host}/${cfg.database}...`,
  );

  if (seedMode === 'migrations') {
    const hadCoreTables = await coreTablesExist();
    if (!hadCoreTables) {
      await syncSchema({ quiet: false });
    }

    const client = new Client(dbConfig());
    await client.connect();
    await ensureMigrationTable(client);

    const ledger = await client.query(
      'SELECT COUNT(*)::int AS n FROM schema_migrations',
    );
    if (repair || (!hadCoreTables && ledger.rows[0].n > 0)) {
      console.log(
        'Repair: clearing schema_migrations ledger before re-applying SQL files...',
      );
      await resetMigrationLedger(client);
    }

    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];

    try {
      for (const file of files) {
        const sql = fs.readFileSync(file, 'utf8');
        const base = path.basename(file);

        if (!forceAll && (await isApplied(client, base))) {
          skipped += 1;
          console.log(`--- ${base} (skipped)`);
          continue;
        }

        console.log(`>>> ${base}`);
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await markApplied(client, base);
          await client.query('COMMIT');
          ok += 1;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          failed += 1;
          failures.push({ file: base, message: err.message });
          console.error(`!!! ${base} failed: ${err.message}`);
          console.error(
            'Stopping to preserve migration ordering. Fix the failure, then rerun.',
          );
          break;
        }
      }
      console.log(
        `Migrations complete (${ok} ok, ${skipped} skipped, ${failed} failed).`,
      );
      if (failures.length) {
        console.error(
          'Failures:',
          JSON.stringify(failures.slice(0, 15), null, 2),
        );
        if (failures.length > 15) {
          console.error(`... and ${failures.length - 15} more`);
        }
      }
    } finally {
      await client.end();
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const client = new Client(dbConfig());
  await client.connect();
  await ensureMigrationTable(client);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  try {
    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      const base = path.basename(file);

      if (
        !forceAll &&
        seedMode === 'migrations' &&
        (await isApplied(client, base))
      ) {
        skipped += 1;
        console.log(`--- ${base} (skipped)`);
        continue;
      }

      console.log(`>>> ${base}`);
      try {
        await client.query(sql);
        if (seedMode === 'migrations') {
          await markApplied(client, base);
        }
        ok += 1;
      } catch (err) {
        failed += 1;
        failures.push({ file: base, message: err.message });
        console.error(`!!! ${base} failed: ${err.message}`);
      }
    }
    console.log(
      seedMode !== 'migrations'
        ? `Seed complete (${ok} ok, ${failed} failed).`
        : `Migrations complete (${ok} ok, ${skipped} skipped, ${failed} failed).`,
    );
    if (failures.length) {
      console.error(
        'Failures:',
        JSON.stringify(failures.slice(0, 15), null, 2),
      );
      if (failures.length > 15) {
        console.error(`... and ${failures.length - 15} more`);
      }
    }
  } finally {
    await client.end();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
