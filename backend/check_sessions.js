const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT session_id, course_id, exam_type, entry_status, marks_locked, semester, created_at
    FROM exam_result_sessions
    WHERE course_id = '4b890b9e-f863-41b8-895c-5964380de9d8' AND exam_type = 'INTERNAL'
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
