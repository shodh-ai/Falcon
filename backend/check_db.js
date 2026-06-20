const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM academic_marks WHERE course_id = 'e472704e-dbf6-4cb3-985a-6336b775818c' AND exam_type = 'QUIZ';");
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
