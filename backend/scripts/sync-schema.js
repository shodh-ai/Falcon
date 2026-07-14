/**
 * Bootstrap base tables from TypeORM entities (same as DB_SYNCHRONIZE=true).
 * SQL migrations in backend/migrations/ expect this schema to exist first.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('pg');

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

function dbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };
}

async function coreTablesExist() {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    const res = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('users', 'roles', 'tenants')`,
    );
    return res.rows[0].n === 3;
  } finally {
    await client.end();
  }
}

async function syncFromEntities() {
  require('reflect-metadata');
  const { DataSource } = require('typeorm');
  const entities = require('../dist/entities');
  const cfg = dbConfig();

  const ds = new DataSource({
    type: 'postgres',
    host: cfg.host,
    port: cfg.port,
    username: cfg.user,
    password: cfg.password,
    database: cfg.database,
    entities: Object.values(entities).filter((e) => typeof e === 'function'),
    synchronize: true,
    logging: false,
  });

  await ds.initialize();
  await ds.destroy();
}

async function run({ quiet = false } = {}) {
  loadEnvFile();
  const cfg = dbConfig();

  if (await coreTablesExist()) {
    if (!quiet) {
      console.log('Schema bootstrap: core tables already exist (users, roles, tenants).');
    }
    return { bootstrapped: false };
  }

  if (!quiet) {
    console.log(
      `Schema bootstrap: creating base tables from TypeORM entities (${cfg.user}@${cfg.host}/${cfg.database})...`,
    );
  }

  execSync('npm run build', {
    cwd: path.join(__dirname, '..'),
    stdio: quiet ? 'ignore' : 'inherit',
  });

  await syncFromEntities();

  if (!quiet) {
    console.log('Schema bootstrap: done.');
  }
  return { bootstrapped: true };
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { run, coreTablesExist, loadEnvFile, dbConfig };
