const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT DISTINCT c.course_id, c.course_code, c.course_name, COALESCE(e.semester, 0) as semester
    FROM academic_courses c
    LEFT JOIN student_course_enrollments e ON e.course_id = c.course_id
    WHERE c.tenant_id = 'a0000000-0000-4000-8000-000000000001'
    ORDER BY c.course_code LIMIT 300
  `);
  console.log(res.rows[0]);
  console.log(typeof res.rows[0].semester);
  process.exit(0);
}
run();
