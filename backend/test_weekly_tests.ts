import { DataSource } from 'typeorm';

async function checkTests() {
  const ds = new DataSource({
    type: 'postgres',
    url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
  });
  await ds.initialize();
  
  try {
    const enrollments = await ds.query(`SELECT DISTINCT student_user_id, tenant_id FROM student_course_enrollments LIMIT 5`);
    for (const student of enrollments) {
      console.log(`Checking tests for student: ${student.student_user_id}`);
      const tests = await ds.query(
        `SELECT t.test_id, t.course_id, c.course_code, c.course_name, t.test_type, t.start_time, t.end_time, t.status,
                r.submitted_at
         FROM weekly_tests t
         JOIN student_course_enrollments e ON e.course_id = t.course_id AND e.student_user_id = $2
         JOIN academic_courses c ON c.course_id = t.course_id
         LEFT JOIN weekly_test_responses r ON r.test_id = t.test_id AND r.student_user_id = $2
         WHERE t.tenant_id = $1 AND t.status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')
         ORDER BY t.start_time ASC`,
        [student.tenant_id, student.student_user_id],
      );
      console.log(`Found ${tests.length} tests`);
      if (tests.length > 0) {
        console.log(tests[0]);
      }
    }
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await ds.destroy();
  }
}

checkTests();
