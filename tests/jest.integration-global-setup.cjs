const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadTestEnv() {
  const envPath = path.join(__dirname, '.env.test');
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

async function resetTestDatabase() {
  if (process.env.FALCON_RESET_DB !== '1') return;

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'falcon_test',
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
    );
    if (rows.length) {
      const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

module.exports = async () => {
  loadTestEnv();
  process.env.NODE_ENV = 'test';
  if (process.env.FALCON_TEST_DB === '1') {
    await resetTestDatabase();
  }
};
