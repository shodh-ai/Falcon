const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
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

loadEnv();

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await client.connect();

  const { rows } = await client.query(`
    SELECT u.official_email,
           array_agg(r.role_name ORDER BY ur.is_primary DESC, r.role_name) AS roles
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.user_id
    JOIN roles r ON r.role_id = ur.role_id
    WHERE u.user_id IN (
      SELECT DISTINCT a.faculty_user_id
      FROM academic_course_allocations a
      JOIN user_roles ur2 ON ur2.user_id = a.faculty_user_id
      JOIN roles rh ON rh.role_id = ur2.role_id AND rh.role_name = 'HOD'
      WHERE a.status = 'ACTIVE' AND a.faculty_user_id IS NOT NULL
    )
    GROUP BY u.user_id, u.official_email
    ORDER BY u.official_email
  `);

  console.log('Teaching HODs with roles:');
  for (const row of rows) {
    console.log(`  ${row.official_email}: ${row.roles.join(', ')}`);
  }
  console.log(`Total teaching HODs: ${rows.length}`);

  const { rows: nonTeaching } = await client.query(`
    SELECT u.official_email, array_agg(r.role_name ORDER BY ur.is_primary DESC, r.role_name) AS roles
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.user_id
    JOIN roles r ON r.role_id = ur.role_id
    WHERE u.user_id IN (
      SELECT ur3.user_id
      FROM user_roles ur3
      JOIN roles rh ON rh.role_id = ur3.role_id AND rh.role_name = 'HOD'
      EXCEPT
      SELECT DISTINCT a.faculty_user_id
      FROM academic_course_allocations a
      WHERE a.status = 'ACTIVE' AND a.faculty_user_id IS NOT NULL
    )
    GROUP BY u.user_id, u.official_email
    HAVING NOT bool_or(r.role_name = 'Faculty')
    ORDER BY u.official_email
    LIMIT 5
  `);

  console.log('\nSample non-teaching HODs (no Faculty role):');
  for (const row of nonTeaching) {
    console.log(`  ${row.official_email}: ${row.roles.join(', ')}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
