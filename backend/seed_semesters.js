const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/university_governance' });
async function run() {
  await client.connect();
  const tenantId = 'a0000000-0000-4000-8000-000000000001';

  // Get a student from existing enrollments
  const studentRes = await client.query(`SELECT student_user_id FROM student_course_enrollments WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  const studentId = studentRes.rows[0].student_user_id;

  const coursesToSeed = [
    { code: 'CSE601', name: 'Artificial Intelligence', sem: 6 },
    { code: 'CSE602', name: 'Compiler Design', sem: 6 },
    { code: 'CSE701', name: 'Machine Learning', sem: 7 },
    { code: 'CSE702', name: 'Cloud Computing', sem: 7 },
    { code: 'CSE801', name: 'Data Science', sem: 8 },
    { code: 'CSE802', name: 'Cyber Security', sem: 8 },
  ];

  for (const c of coursesToSeed) {
    // Insert into academic_courses
    const courseRes = await client.query(`
      INSERT INTO academic_courses (course_code, course_name, tenant_id, credits, course_type)
      VALUES ($1, $2, $3, 4, 'THEORY')
      ON CONFLICT (tenant_id, course_code) DO UPDATE SET course_name = EXCLUDED.course_name
      RETURNING course_id
    `, [c.code, c.name, tenantId]);
    
    const courseId = courseRes.rows[0].course_id;

    // Enroll the student
    await client.query(`
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, semester, status)
      VALUES ($1, $2, $3, $4, 'ENROLLED')
      ON CONFLICT DO NOTHING
    `, [tenantId, studentId, courseId, c.sem]);
  }

  console.log('Seeded successfully!');
  process.exit(0);
}
run();
