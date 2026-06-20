const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT c.course_code, e.semester
    FROM academic_courses c
    LEFT JOIN student_course_enrollments e ON c.course_id = e.course_id
    GROUP BY c.course_code, e.semester
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
