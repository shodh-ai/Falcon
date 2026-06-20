const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT s.session_id, c.course_code, s.exam_type, s.semester, s.entry_status, s.tenant_id
    FROM exam_result_sessions s
    JOIN academic_courses c ON c.course_id = s.course_id
    WHERE c.course_code = 'DA101' AND s.exam_type = 'QUIZ'
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
