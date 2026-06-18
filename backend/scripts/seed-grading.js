const { DataSource } = require('typeorm');
const dotenv = require('dotenv');

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function main() {
  await dataSource.initialize();
  console.log('DB Connected');

  // Let's test the query first to see if it fails
  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  
  // Find a faculty user
  const facultyRes = await dataSource.query(`SELECT user_id FROM users WHERE role_id IN (SELECT role_id FROM roles WHERE role_name = 'Faculty') LIMIT 1`);
  const facultyUserId = facultyRes[0]?.user_id;

  if (!facultyUserId) {
    console.log('No faculty user found');
    process.exit(1);
  }

  // Find DA101 course
  const courseRes = await dataSource.query(`SELECT course_id FROM academic_courses WHERE course_code = 'DA101' LIMIT 1`);
  let courseId = courseRes[0]?.course_id;

  if (!courseId) {
    console.log('DA101 not found, trying to find any course assigned to this faculty');
    const ttRes = await dataSource.query(`SELECT course_id FROM academic_timetables WHERE faculty_user_id = $1 LIMIT 1`, [facultyUserId]);
    courseId = ttRes[0]?.course_id;
  }

  if (!courseId) {
    console.log('No course found');
    process.exit(1);
  }

  console.log(`Testing with faculty: ${facultyUserId}, course: ${courseId}`);

  try {
    const rows = await dataSource.query(
      `SELECT
         u.user_id AS student_user_id,
         u.name,
         COALESCE(sp.enrollment_no, sp.admission_number, u.user_id::text) AS roll_number,
         m.mark_id,
         m.marks_obtained,
         m.max_marks,
         m.co_mapped,
         m.status AS mark_status
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN academic_marks m
         ON m.tenant_id = e.tenant_id
        AND m.student_user_id = e.student_user_id
        AND m.course_id = e.course_id
        AND m.exam_type = $3
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.status = 'ENROLLED'
       ORDER BY u.name`,
      [tenantId, courseId, 'CAT2']
    );
    console.log('Query succeeded! Rows:', rows.length);
  } catch (err) {
    console.error('Query failed:', err.message);
  }

  // Let's seed some students into DA101
  console.log('Seeding students to DA101');
  const students = await dataSource.query(`SELECT user_id FROM users WHERE role_id IN (SELECT role_id FROM roles WHERE role_name = 'Student') LIMIT 5`);
  for (const st of students) {
    await dataSource.query(`
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, status, semester)
      VALUES ($1, $2, $3, 'ENROLLED', 1)
      ON CONFLICT DO NOTHING
    `, [tenantId, st.user_id, courseId]);
  }
  console.log('Students seeded.');

  await dataSource.destroy();
}

main().catch(console.error);
