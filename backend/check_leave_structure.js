const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM hr_leave_requests LIMIT 5;");
    console.log('Leaves:', res.rows);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
