const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT m.mark_id, u.name, m.exam_type, m.marks_obtained, c.course_code FROM academic_marks m JOIN users u ON u.user_id = m.student_user_id JOIN academic_courses c ON c.course_id = m.course_id WHERE u.name = 'E2E Student Three'");
  console.log(res.rows);
  process.exit(0);
}
run();
