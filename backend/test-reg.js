const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:postgres@localhost:5432/university_governance',
});

async function run() {
  await dataSource.initialize();
  const userId = 'b0000001-0000-4000-8000-000000000001'; // Student One
  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  try {
    const currentSemesterRows = await dataSource.query(
      `SELECT COALESCE(MAX(semester), 1) AS semester
       FROM student_course_enrollments WHERE student_user_id = $1`,
      [userId],
    );
    const currentSemester = Number(currentSemesterRows[0]?.semester ?? 1);
    console.log("Semester:", currentSemester);

    const coreCourses = await dataSource.query(
      `SELECT course_id FROM academic_courses
       WHERE tenant_id = $1
         AND COALESCE(course_type, CASE WHEN is_elective THEN 'ELECTIVE' ELSE 'CORE' END) = 'CORE'`,
      [tenantId],
    );
    console.log("Core courses:", coreCourses);

    for (const course of coreCourses) {
      await dataSource.query(
        `INSERT INTO student_course_enrollments (
           tenant_id, student_user_id, course_id, semester, status, attendance_percent
         )
         SELECT $1, $2, $3, $4, 'ENROLLED', 0
         WHERE NOT EXISTS (
           SELECT 1 FROM student_course_enrollments
           WHERE student_user_id = $2 AND course_id = $3 AND semester = $4
         )`,
        [tenantId, userId, course.course_id, currentSemester],
      );
    }
    console.log("Insert ok");

    const enrollments = await dataSource.query(
      `SELECT e.enrollment_id, e.semester, e.status, e.grade, e.grade_points,
              c.course_id, c.course_code, c.course_name, c.credits,
              COALESCE(c.course_type, CASE WHEN c.is_elective THEN 'ELECTIVE' ELSE 'CORE' END) AS course_type
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.student_user_id = $1 AND e.tenant_id = $2
       ORDER BY e.semester, c.course_code`,
      [userId, tenantId],
    );
    console.log("Enrollments ok", enrollments.length);

    const electives = await dataSource.query(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits
       FROM academic_courses c
       WHERE c.tenant_id = $1
         AND COALESCE(c.course_type, CASE WHEN c.is_elective THEN 'ELECTIVE' ELSE 'CORE' END) = 'ELECTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM student_course_enrollments e
           WHERE e.course_id = c.course_id AND e.student_user_id = $2 AND e.semester = $3
         )
       ORDER BY c.course_code`,
      [tenantId, userId, currentSemester],
    );
    console.log("Electives ok", electives.length);

  } catch (err) {
    console.error("DB Error:", err);
  }
  await dataSource.destroy();
}

run();
