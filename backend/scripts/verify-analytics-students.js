const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await client.connect();

  const faculty = await client.query(
    `SELECT user_id, name FROM users WHERE lower(official_email) LIKE '%rahul.kumar%' LIMIT 1`,
  );
  const tenant = await client.query(
    `SELECT tenant_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1`,
  );
  const facultyUserId = faculty.rows[0]?.user_id;
  const tenantId = tenant.rows[0]?.tenant_id;
  console.log('Faculty:', faculty.rows[0]);

  const course = await client.query(
    `SELECT course_id, course_code, course_name FROM academic_courses WHERE course_code = 'CP302' LIMIT 1`,
  );
  const courseId = course.rows[0]?.course_id;
  console.log('Course:', course.rows[0]);

  const owns = await client.query(
    `SELECT 1 AS ok
     WHERE EXISTS (
       SELECT 1 FROM academic_course_allocations
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3 AND status = 'ACTIVE'
     ) OR EXISTS (
       SELECT 1 FROM academic_timetables
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND course_id = $3
     )`,
    [tenantId, facultyUserId, courseId],
  );
  console.log('Owns course:', owns.rows.length > 0);

  const enrolled = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM student_course_enrollments
     WHERE tenant_id = $1 AND course_id = $2 AND status = 'ENROLLED'`,
    [tenantId, courseId],
  );
  console.log('Enrolled students:', enrolled.rows[0].count);

  const accessSql = `(
    EXISTS (
      SELECT 1 FROM academic_course_allocations a
      WHERE a.tenant_id = e.tenant_id
        AND a.course_id = e.course_id
        AND a.faculty_user_id = $2
        AND a.status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM academic_timetables t
      WHERE t.course_id = e.course_id
        AND t.faculty_user_id = $2
        AND t.tenant_id = e.tenant_id
    )
  )`;

  const students = await client.query(
    `SELECT u.name, u.official_email
     FROM student_course_enrollments e
     INNER JOIN users u ON u.user_id = e.student_user_id
     WHERE e.tenant_id = $1
       AND e.status = 'ENROLLED'
       AND e.course_id = $3
       AND ${accessSql}
     ORDER BY u.name`,
    [tenantId, facultyUserId, courseId],
  );
  console.log('Visible to faculty:', students.rows);

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
