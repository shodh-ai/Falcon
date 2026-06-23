const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  
  // Find E2E Student Three
  const res = await client.query("SELECT user_id FROM users WHERE name = 'E2E Student Three'");
  const studentId = res.rows[0].user_id;

  // Find DA101 course
  const res2 = await client.query("SELECT course_id FROM academic_courses WHERE course_code = 'DA101'");
  const courseId = res2.rows[0].course_id;

  // Update CAT2 marks to 10
  await client.query("UPDATE academic_marks SET marks_obtained = 10 WHERE student_user_id = $1 AND course_id = $2 AND exam_type = 'CAT2'", [studentId, courseId]);

  console.log("Updated marks successfully");
  process.exit(0);
}
run();
