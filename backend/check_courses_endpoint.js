const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT DISTINCT e.semester, c.course_id, c.course_name, c.course_code 
    FROM student_course_enrollments e
    JOIN academic_courses c ON c.course_id = e.course_id
    WHERE e.tenant_id = 'a0000000-0000-4000-8000-000000000001'
    LIMIT 5;
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
