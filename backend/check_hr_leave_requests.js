const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hr_leave_requests';");
    console.log('hr_leave_requests columns:', res.rows);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
