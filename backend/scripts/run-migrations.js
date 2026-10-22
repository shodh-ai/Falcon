/**
 * Apply SQL migrations from backend/migrations/ (sorted by filename).
 *
 * Uses DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE from the environment
 * (same vars as the NestJS app). On a fresh database, base tables are bootstrapped from
 * TypeORM entities before SQL migrations run only with explicit local opt-in.
 * Production pending migrations require a reviewed filename/SHA-256 manifest.
 * Ledger repair and known-password seed commands are local development only.
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
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

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_LOCK_NAME = 'falcon:schema-migrations';

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

function isProductionEnvironment() {
  return ['NODE_ENV', 'DATABASE_ENV', 'DEPLOYMENT_ENV'].some((name) =>
    ['production', 'prod'].includes(
      String(process.env[name] || '')
        .trim()
        .toLowerCase(),
    ),
  );
}

/**
 * Historical SQL includes credential resets and data seeds. Do not infer which
 * files are safe from their names. Production must explicitly review every
 * pending file and bind that review to the bytes that will actually execute.
 */
async function reviewedProductionMigrations(client, files) {
  const relation = await client.query(
    "SELECT to_regclass('public.schema_migrations') AS migration_table",
  );
  const applied = relation.rows[0]?.migration_table
    ? new Set(
        (await client.query('SELECT filename FROM schema_migrations')).rows.map(
          (row) => row.filename,
        ),
      )
    : new Set();
  const pending = files.filter((file) => !applied.has(path.basename(file)));
  if (pending.length === 0) return new Map();

  const manifestPath = process.env.PRODUCTION_MIGRATION_MANIFEST;
  if (!manifestPath) {
    throw new Error(
      'Refusing unreviewed production migrations: configure PRODUCTION_MIGRATION_MANIFEST with exact reviewed filenames and SHA-256 hashes.',
    );
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    !manifest ||
    manifest.version !== 1 ||
    !manifest.migrations ||
    typeof manifest.migrations !== 'object' ||
    Array.isArray(manifest.migrations) ||
    Object.keys(manifest).some(
      (key) => !['version', 'migrations'].includes(key),
    )
  ) {
    throw new Error(
      'Invalid production migration manifest: expected version 1 and a migrations filename/hash object.',
    );
  }
  const knownFiles = new Set(files.map((file) => path.basename(file)));
  for (const [name, hash] of Object.entries(manifest.migrations)) {
    if (
      !knownFiles.has(name) ||
      typeof hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(hash)
    ) {
      throw new Error(`Invalid production migration manifest entry: ${name}`);
    }
  }

  const reviewed = new Map();
  for (const file of pending) {
    const name = path.basename(file);
    const bytes = fs.readFileSync(file);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (manifest.migrations[name] !== hash) {
      throw new Error(
        `Refusing unreviewed or changed production migration: ${name}`,
      );
    }
    // Retain the reviewed SQL so a later file change cannot alter execution.
    reviewed.set(name, bytes.toString('utf8'));
  }
  return reviewed;
}

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
    isProductionEnvironment() ||
    !['development', 'test'].includes(nodeEnv) ||
    !['local', 'development', 'test'].includes(databaseEnv)
  ) {
    throw new Error(
      'Refusing DoFA QA seed outside an explicitly local development environment.',
    );
  }
}

function assertStandardSeedAllowed() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const databaseEnv = String(
    process.env.DATABASE_ENV || process.env.DEPLOYMENT_ENV || '',
  ).toLowerCase();
  if (process.env.ALLOW_STANDARD_SEED !== 'true') {
    throw new Error(
      'Refusing standard seed: set ALLOW_STANDARD_SEED=true explicitly.',
    );
  }
  if (
    isProductionEnvironment() ||
    nodeEnv !== 'development' ||
    !['local', 'development', 'test'].includes(databaseEnv)
  ) {
    throw new Error(
      'Refusing standard seed outside an explicitly local development environment.',
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

function assertBootstrapSyncAllowed() {
  if (process.env.ALLOW_SCHEMA_BOOTSTRAP_SYNC !== 'true') {
    throw new Error(
      'Refusing automatic schema bootstrap: set ALLOW_SCHEMA_BOOTSTRAP_SYNC=true explicitly.',
    );
  }
  if (isProductionEnvironment()) {
    throw new Error('Refusing automatic schema bootstrap in production.');
  }
}

async function run() {
  loadEnvFile();
  const seedOnly = process.argv.includes('--seed');
  const dofaQaSeedOnly = process.argv.includes('--dofa-qa-seed');
  if (seedOnly && dofaQaSeedOnly) {
    throw new Error('Choose either --seed or --dofa-qa-seed, not both.');
  }
  if (dofaQaSeedOnly) assertDofaQaSeedAllowed();
  else if (seedOnly) assertStandardSeedAllowed();
  const seedMode = dofaQaSeedOnly
    ? 'dofa-qa'
    : seedOnly
      ? 'standard'
      : 'migrations';
  const forceAll = process.argv.includes('--force');
  const repair = process.argv.includes('--repair');
  const production = isProductionEnvironment();
  if (production && (forceAll || repair)) {
    throw new Error(
      'Refusing production migration replay or ledger repair (--force/--repair).',
    );
  }
  const files = listSqlFiles(seedMode);

  const cfg = dbConfig();
  console.log(
    seedMode !== 'migrations'
      ? `Running ${files.length} seed file(s) as ${cfg.user}@${cfg.host}/${cfg.database}...`
      : `Running ${files.length} migration(s) as ${cfg.user}@${cfg.host}/${cfg.database}...`,
  );

  if (seedMode === 'migrations') {
    const client = new Client(dbConfig());
    await client.connect();
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [
      MIGRATION_LOCK_NAME,
    ]);
    let failed = 0;

    try {
      const hadCoreTables = await coreTablesExist();
      if (!hadCoreTables) {
        assertBootstrapSyncAllowed();
        await syncSchema({ quiet: false });
      }
      // Validate the entire pending plan before any migration or ledger write.
      const reviewed = production
        ? await reviewedProductionMigrations(client, files)
        : null;
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
      const failures = [];

      for (const file of files) {
        const base = path.basename(file);
        const sql = production
          ? reviewed.get(base)
          : fs.readFileSync(file, 'utf8');

        if (
          production
            ? !reviewed.has(base)
            : !forceAll && (await isApplied(client, base))
        ) {
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
      await client
        .query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME])
        .catch(() => undefined);
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

module.exports = { run, isProductionEnvironment, reviewedProductionMigrations };

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
