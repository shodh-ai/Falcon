const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT course_id FROM academic_courses WHERE course_code = 'SMOKE101';");
    const courseId = res.rows[0].course_id;
    console.log('Course ID:', courseId);
    
    const marks = await client.query("SELECT * FROM academic_marks WHERE course_id = $1;", [courseId]);
    console.log('Marks:', marks.rows);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
