const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT * FROM submissions");
  console.log("Submissions:");
  console.log(res.rows);
  const res2 = await client.query("SELECT * FROM task_assignments");
  console.log("Assignments:");
  console.log(res2.rows);
  process.exit(0);
}
run();
