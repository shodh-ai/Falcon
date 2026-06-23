const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  try {
    const tenantId = 'a0000000-0000-4000-8000-000000000001';
    const approverRole = 'LIBRARIAN';
    const dbRole = 'Librarian'; // mapApproverRole

    const users = await client.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = $2 AND u.is_active = true`,
      [tenantId, dbRole]
    );
    console.log("notify users:", users.rows);
  } catch (e) {
    console.error("notify users error:", e);
  }
  process.exit(0);
}
run();
