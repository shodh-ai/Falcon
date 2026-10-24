/** Run manually only after deploying the tested read-only backend release. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Explicit --apply is required');
  for (const [file, marker] of [
    ['dist/app.module.js', 'FacultyReadOnlyInterceptor'],
    ['dist/auth/strategies/jwt.strategy.js', 'faculty_read_only_viewers'],
  ]) {
    if (!fs.readFileSync(path.join(__dirname, '..', file), 'utf8').includes(marker)) {
      throw new Error('Deploy the read-only backend before provisioning any account');
    }
  }
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await c.connect();
  try {
    await c.query('BEGIN');
    const sourceRows = await c.query(`
      SELECT u.user_id,u.tenant_id,u.dept_id,u.entity_id,u.onboarding_status
      FROM users u JOIN tenants t ON t.tenant_id=u.tenant_id
      JOIN roles r ON r.role_id=u.role_id AND r.role_name='Faculty'
      WHERE t.subdomain='sgvu' AND t.is_active=true
        AND lower(u.official_email)='yogesh.matta@mygyanvihar.com'
        AND u.is_active=true AND u.deleted_at IS NULL
      FOR SHARE OF u`);
    if (sourceRows.rows.length !== 1) throw new Error('Expected one active SGVU Yogesh Faculty account');
    const source = sourceRows.rows[0];
    const existing = await c.query('SELECT user_id FROM users WHERE tenant_id=$1 AND lower(official_email)=$2', [source.tenant_id, 'sachin.pharma@mygyanvihar.com']);
    if (existing.rows.length) throw new Error('Sachin account already exists; refusing to overwrite its password or permissions');
    const role = await c.query("SELECT role_id FROM roles WHERE role_name='FacultyReadOnly'");
    if (role.rows.length !== 1) throw new Error('Run migrations before provisioning');
    const password = `Temp!${crypto.randomBytes(16).toString('hex')}7`;
    const hash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    await c.query(`INSERT INTO users
      (user_id,tenant_id,name,official_email,role_id,dept_id,entity_id,password_hash,
       is_active,onboarding_status,account_status,onboarding_profile)
      VALUES ($1,$2,'Sachin — Read-only Pharmacy Testing','sachin.pharma@mygyanvihar.com',
              $3,$4,$5,$6,true,'COMPLETED','PASSWORD_RESET_REQUIRED','{}'::jsonb)`,
      [userId, source.tenant_id, role.rows[0].role_id, source.dept_id, source.entity_id, hash]);
    await c.query('INSERT INTO user_roles(user_id,role_id,is_primary) VALUES ($1,$2,true)', [userId, role.rows[0].role_id]);
    await c.query(`INSERT INTO faculty_read_only_viewers(viewer_user_id,tenant_id,source_user_id,enabled,reason)
      VALUES ($1,$2,$3,true,'User-authorized read-only verification of Yogesh academic visibility')`,
      [userId, source.tenant_id, source.user_id]);
    // No source account, allocations, timetables, enrollments, grades or HR rows
    // are updated or copied by this script.
    await c.query('COMMIT');
    console.log('Email: sachin.pharma@mygyanvihar.com');
    console.log('Temporary password:', password);
    console.log('Access: read-only academic observation; change own password at first login.');
    console.log('Yogesh account and teaching data unchanged. No duplicated workload or students.');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
