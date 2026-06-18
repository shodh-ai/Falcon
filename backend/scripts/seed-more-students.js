const { DataSource } = require('typeorm');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function main() {
  await dataSource.initialize();
  console.log('DB Connected');

  const tenantId = 'a0000000-0000-4000-8000-000000000001';

  // Get the Student role ID
  const roleRes = await dataSource.query(`SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1`);
  const studentRoleId = roleRes[0]?.role_id;

  if (!studentRoleId) {
    console.log('Student role not found');
    process.exit(1);
  }

  // Get DA101 course
  const courseRes = await dataSource.query(`SELECT course_id FROM academic_courses WHERE course_code = 'DA101' LIMIT 1`);
  const courseId = courseRes[0]?.course_id;

  if (!courseId) {
    console.log('DA101 not found');
    process.exit(1);
  }

  console.log('Seeding 10 new dummy students...');
  for (let i = 1; i <= 10; i++) {
    const studentUserId = crypto.randomUUID();
    const ts = Date.now();
    const name = `Dummy Student ${ts} ${i}`;
    const email = `dummy.student${ts}.${i}@example.com`;
    const enrollmentNo = `DUMMY${ts}${i}`;

    // 1. Insert User
    await dataSource.query(`
      INSERT INTO users (tenant_id, user_id, name, official_email, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
    `, [tenantId, studentUserId, name, email, studentRoleId]);

    // 2. Insert Profile
    const profileId = crypto.randomUUID();
    await dataSource.query(`
      INSERT INTO student_profiles (student_profile_id, user_id, enrollment_no, status)
      VALUES ($1, $2, $3, 'ACTIVE')
    `, [profileId, studentUserId, enrollmentNo]);

    // 3. Enroll in DA101
    await dataSource.query(`
      INSERT INTO student_course_enrollments (tenant_id, student_user_id, course_id, status, semester)
      VALUES ($1, $2, $3, 'ENROLLED', 1)
      ON CONFLICT DO NOTHING
    `, [tenantId, studentUserId, courseId]);
  }

  console.log('Successfully seeded 10 more students into DA101!');
  await dataSource.destroy();
}

main().catch(console.error);
