/**
 * Apply all SQL migrations, continuing on per-file errors (logs failures).
 */
const fs = require('fs');
const path = require('path');
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

loadEnvFile();

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => path.join(MIGRATIONS_DIR, name));

  const client = new Client(cfg);
  await client.connect();

  let ok = 0;
  let failed = 0;
  const failures = [];

  try {
    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      const base = path.basename(file);
      try {
        await client.query(sql);
        ok += 1;
        console.log(`OK  ${base}`);
      } catch (err) {
        failed += 1;
        failures.push({ file: base, message: err.message });
        console.error(`FAIL ${base}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log(JSON.stringify({ ok, failed, failures: failures.slice(0, 20) }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
