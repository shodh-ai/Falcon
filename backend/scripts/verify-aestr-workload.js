const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'university_governance',
  });
  await c.connect();

  const summary = await c.query(`
    SELECT
      (SELECT COUNT(*)::int FROM academic_course_allocations WHERE academic_year = '2026-2027') AS allocations,
      (SELECT COUNT(*)::int FROM academic_courses WHERE course_code LIKE '% %') AS spaced_codes,
      (SELECT COUNT(*)::int FROM (
         SELECT course_code FROM academic_courses GROUP BY tenant_id, course_code HAVING COUNT(*) > 1
       ) d) AS dup_codes
  `);

  const naman = await c.query(`
    SELECT DISTINCT c.course_code, c.course_name
    FROM academic_course_allocations a
    JOIN users u ON u.user_id = a.faculty_user_id
    JOIN academic_courses c ON c.course_id = a.course_id
    WHERE a.academic_year = '2026-2027'
      AND lower(u.official_email) = 'naman.raj@mygyanvihar.com'
    ORDER BY c.course_code
  `);

  const facultyLoads = await c.query(`
    SELECT u.name, COUNT(DISTINCT c.course_code)::int AS unique_courses
    FROM academic_course_allocations a
    JOIN users u ON u.user_id = a.faculty_user_id
    JOIN academic_courses c ON c.course_id = a.course_id
    WHERE a.academic_year = '2026-2027'
    GROUP BY u.name
    ORDER BY u.name
  `);

  console.log('SUMMARY', summary.rows[0]);
  console.log('NAMAN COURSES', naman.rows);
  console.log('FACULTY LOADS', facultyLoads.rows);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
