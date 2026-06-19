const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });

async function run() {
  await client.connect();
  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  const courseId = 'd354b186-a55d-403d-bf64-793bd62bc447'; // CSE601

  // Find some students from student_profiles
  const students = await client.query(`SELECT user_id FROM users LIMIT 5`);
  const userIds = students.rows.map(r => r.user_id);

  // Find any user for uploaded_by
  const fac = await client.query(`SELECT user_id FROM users LIMIT 1`);
  const uploadedBy = fac.rows[0].user_id;

  for (const uid of userIds) {
    // Enroll them in CSE601 semester 6
    await client.query(`
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status, attendance_percent)
      VALUES ($1, $2, $3, 6, 'ENROLLED', 80)
      ON CONFLICT DO NOTHING
    `, [tenantId, uid, courseId]);

    // Insert marks
    const exams = [
      { type: 'QUIZ', max: 10, obt: Math.floor(Math.random() * 6) + 4 },
      { type: 'INTERNAL', max: 10, obt: Math.floor(Math.random() * 6) + 4 },
      { type: 'CAT1', max: 15, obt: Math.floor(Math.random() * 10) + 5 },
      { type: 'CAT2', max: 15, obt: Math.floor(Math.random() * 10) + 5 },
      { type: 'END_TERM', max: 50, obt: Math.floor(Math.random() * 30) + 20 }
    ];

    // Delete existing
    await client.query(`DELETE FROM academic_marks WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3`, [tenantId, uid, courseId]);

    for (const ex of exams) {
      await client.query(`
        INSERT INTO academic_marks (tenant_id, course_id, exam_type, student_user_id, marks_obtained, max_marks, status, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, 'PUBLISHED', $7)
      `, [tenantId, courseId, ex.type, uid, ex.obt, ex.max, uploadedBy]);
    }
  }

  // Insert a student with pending marks (missing END_TERM)
  const pendingUid = userIds[0];
  await client.query(`DELETE FROM academic_marks WHERE tenant_id = $1 AND student_user_id = $2 AND course_id = $3 AND exam_type = 'END_TERM'`, [tenantId, pendingUid, courseId]);

  console.log("Seeding complete!");
  process.exit(0);
}
run();
