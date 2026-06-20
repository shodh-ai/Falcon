const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT course_id, course_name FROM academic_courses WHERE course_code = 'SMOKE101';");
    console.log('Courses:', res.rows);
    
    for (const c of res.rows) {
      const marks = await client.query("SELECT * FROM academic_marks WHERE course_id = $1 AND exam_type = 'QUIZ';", [c.course_id]);
      console.log(`Marks for ${c.course_id}:`, marks.rows);
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
