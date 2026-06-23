const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM student_profiles LIMIT 1");
    console.log(res.rows);
  } catch (e) {
    console.error(e.message);
  }
  process.exit(0);
}
run();
