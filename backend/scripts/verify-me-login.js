/**
 * Verify ME student login accounts exist with password_hash set.
 * Run in Coolify backend terminal: node scripts/verify-me-login.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

const SAMPLE_EMAILS = [
  'yashika.2548821@mygyanvihar.com',
  'aryan.2455698@mygyanvihar.com',
  'anshuman.2549873@mygyanvihar.com',
];

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await client.connect();

  const prereqs = await client.query(`
    SELECT
      (SELECT count(*)::int FROM tenants WHERE subdomain = 'sgvu') AS sgvu_tenant,
      (SELECT count(*)::int FROM departments WHERE dept_name IN ('Mech Engg', 'Mechanical Engineering')) AS mech_dept,
      (SELECT count(*)::int FROM org_entities oe JOIN tenants t ON t.tenant_id = oe.tenant_id WHERE t.subdomain = 'sgvu' AND oe.is_active = true) AS sgvu_entities
  `);
  console.log('Prerequisites:', prereqs.rows[0]);

  const count = await client.query(`
    SELECT count(*)::int AS n
    FROM users u
    JOIN tenants t ON t.tenant_id = u.tenant_id
    JOIN departments d ON d.dept_id = u.dept_id
    JOIN roles r ON r.role_id = u.role_id
    WHERE t.subdomain = 'sgvu'
      AND d.dept_name IN ('Mech Engg', 'Mechanical Engineering')
      AND r.role_name = 'Student'
      AND u.password_hash IS NOT NULL
      AND u.is_active = true
  `);
  console.log('ME students with password_hash:', count.rows[0].n);

  for (const email of SAMPLE_EMAILS) {
    const row = await client.query(
      `SELECT u.official_email, u.is_active, u.password_hash IS NOT NULL AS has_pw, t.subdomain
       FROM users u
       JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE lower(u.official_email) = lower($1)`,
      [email],
    );
    console.log(`\n${email}:`, row.rows[0] ?? 'NOT FOUND');
  }

  await client.end();

  const n = count.rows[0].n;
  if (n < 39) {
    console.error(`\nVerification FAILED: expected >= 39 ME student logins, found ${n}`);
    process.exit(1);
  }
  console.log('\nVerification OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
