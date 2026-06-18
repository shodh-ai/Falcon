// Simulate the exact login flow to find where it crashes
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const c = new Client({
  host: 'localhost', port: 5432,
  user: 'postgres', password: 'postgres',
  database: 'university_governance',
});

async function main() {
  await c.connect();
  console.log('=== Step 1: Find user by email ===');
  const credRes = await c.query(
    `SELECT user_id, password_hash, is_active
     FROM users
     WHERE LOWER(official_email) = LOWER($1)
       AND tenant_id = $2
     LIMIT 1`,
    ['warden@mygyanvihar.com', 'a0000000-0000-4000-8000-000000000001']
  );
  const cred = credRes.rows[0];
  console.log('Credential found:', !!cred, 'active:', cred?.is_active);

  console.log('\n=== Step 2: Verify password ===');
  const valid = await bcrypt.compare('password123', cred.password_hash);
  console.log('Password valid:', valid);

  console.log('\n=== Step 3: findById with relations ===');
  const userRes = await c.query(
    `SELECT u.*, r.role_name, d.dept_name
     FROM users u
     LEFT JOIN roles r ON r.role_id = u.role_id
     LEFT JOIN departments d ON d.dept_id = u.dept_id
     WHERE u.user_id = $1`,
    [cred.user_id]
  );
  console.log('User found:', !!userRes.rows[0]);

  console.log('\n=== Step 4: Check user_roles ===');
  const rolesRes = await c.query(
    `SELECT ur.role_id, ur.is_primary, r.role_name
     FROM user_roles ur
     LEFT JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = $1`,
    [cred.user_id]
  );
  console.log('Roles:', JSON.stringify(rolesRes.rows));

  console.log('\n=== Step 5: Check org_entities table exists ===');
  try {
    const entitiesRes = await c.query(`SELECT COUNT(*)::int as cnt FROM org_entities`);
    console.log('org_entities count:', entitiesRes.rows[0].cnt);
  } catch (e) {
    console.log('org_entities ERROR:', e.message);
  }

  console.log('\n=== Step 6: Check hr_access_controls table ===');
  try {
    const aclRes = await c.query(
      `SELECT * FROM hr_access_controls WHERE user_id = $1 LIMIT 5`,
      [cred.user_id]
    );
    console.log('hr_access_controls rows:', aclRes.rows.length);
  } catch (e) {
    console.log('hr_access_controls ERROR:', e.message);
  }

  console.log('\n=== Step 7: Check hr_permissions table ===');
  try {
    const permsRes = await c.query(
      `SELECT * FROM hr_permissions WHERE user_id = $1`,
      [cred.user_id]
    );
    console.log('hr_permissions rows:', permsRes.rows.length);
  } catch (e) {
    console.log('hr_permissions ERROR:', e.message);
  }

  console.log('\n=== Step 8: Simulate listAllowedEntities ===');
  try {
    const allowed = await c.query(
      `SELECT DISTINCT oe.entity_id, oe.entity_code, oe.entity_name, oe.is_active
       FROM org_entities oe
       WHERE oe.tenant_id = $1 AND oe.is_active = true
         AND (
           oe.entity_id IN (
             SELECT uea.entity_id FROM user_entity_access uea WHERE uea.user_id = $2
           )
           OR oe.entity_id = (
             SELECT COALESCE(u.entity_id, p.entity_id)
             FROM users u
             LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
             WHERE u.user_id = $2 AND u.tenant_id = $1
           )
         )
       ORDER BY oe.entity_id ASC`,
      ['a0000000-0000-4000-8000-000000000001', cred.user_id]
    );
    console.log('Allowed entities:', JSON.stringify(allowed.rows));
  } catch (e) {
    console.log('listAllowedEntities ERROR:', e.message);
  }

  console.log('\n=== Step 9: Check user_entity_access table ===');
  try {
    const ueaRes = await c.query(`SELECT COUNT(*)::int as cnt FROM user_entity_access`);
    console.log('user_entity_access count:', ueaRes.rows[0].cnt);
  } catch (e) {
    console.log('user_entity_access ERROR:', e.message);
  }

  await c.end();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
