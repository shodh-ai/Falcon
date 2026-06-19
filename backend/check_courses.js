const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'academic_courses'
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
