/**
 * Audit public schema tables vs migration-defined CREATE TABLE names.
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

function expectedTables() {
  const tables = new Set();
  const re = /CREATE TABLE IF NOT EXISTS (?:public\.)?(\w+)/gi;
  for (const name of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    let m;
    while ((m = re.exec(sql)) !== null) tables.add(m[1]);
  }
  return tables;
}

async function main() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };

  const client = new Client(cfg);
  await client.connect();

  const meta = await client.query(
    `SELECT current_database() AS db, current_user AS usr,
            current_schema() AS schema,
            (SELECT setting FROM pg_settings WHERE name = 'search_path') AS search_path`,
  );

  const existing = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const existingSet = new Set(existing.rows.map((r) => r.tablename));
  const expected = expectedTables();
  const missing = [...expected].filter((t) => !existingSet.has(t)).sort();
  const extra = [...existingSet].filter((t) => !expected.has(t)).sort();

  const critical = ['hostel_booking_holds', 'event_registrations', 'campus_events', 'tenants'];
  const criticalStatus = {};
  for (const t of critical) {
    if (!existingSet.has(t)) {
      criticalStatus[t] = { exists: false, rows: 0 };
      continue;
    }
    const count = await client.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    criticalStatus[t] = { exists: true, rows: count.rows[0].n };
  }

  console.log(JSON.stringify({
    connection: { host: cfg.host, port: cfg.port, user: cfg.user, database: cfg.database },
    meta: meta.rows[0],
    counts: { existing: existingSet.size, expectedFromMigrations: expected.size, missing: missing.length, extra: extra.length },
    critical: criticalStatus,
    missingTables: missing.slice(0, 80),
    extraTables: extra.slice(0, 40),
  }, null, 2));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
