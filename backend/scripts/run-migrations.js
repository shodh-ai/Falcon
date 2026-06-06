/**
 * Apply SQL migrations from backend/migrations/ (sorted by filename).
 *
 * Uses DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE from the environment
 * (same vars as the NestJS app). Safe to run in Coolify backend terminal:
 *   npm run db:migrate
 *   npm run db:seed
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

function dbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };
}

function listSqlFiles(seedOnly) {
  const all = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (!seedOnly) {
    return all.map((name) => path.join(MIGRATIONS_DIR, name));
  }

  const selected = all.filter((name) => SEED_FILES.includes(name));
  if (selected.length === 0) {
    throw new Error(`No seed files found. Expected: ${SEED_FILES.join(', ')}`);
  }
  return selected.map((name) => path.join(MIGRATIONS_DIR, name));
}

async function run() {
  const seedOnly = process.argv.includes('--seed');
  const files = listSqlFiles(seedOnly);

  const cfg = dbConfig();
  console.log(
    seedOnly
      ? `Running ${files.length} seed file(s) as ${cfg.user}@${cfg.host}/${cfg.database}...`
      : `Running ${files.length} migration(s) as ${cfg.user}@${cfg.host}/${cfg.database}...`,
  );

  const client = new Client(dbConfig());
  await client.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      console.log(`>>> ${path.basename(file)}`);
      await client.query(sql);
    }
    console.log(seedOnly ? 'Seed complete.' : 'Migrations complete.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
