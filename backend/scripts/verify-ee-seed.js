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

  const checks = [
    [
      'ee students with semester',
      `SELECT count(*)::int AS n FROM users u
       JOIN student_profiles sp ON sp.user_id = u.user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Electrical Engg'
         AND sp.batch = 'B.Tech EE'
         AND sp.current_semester IN (3, 5)`,
    ],
    [
      'ee allocations',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       WHERE a.program_name = 'B.Tech EE' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    ],
    [
      'ee timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE c.course_code LIKE 'EE3%' OR c.course_code LIKE 'EE5%'`,
    ],
    [
      'ee enrollments',
      `SELECT count(*)::int AS n FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Electrical Engg' AND e.status = 'ENROLLED'`,
    ],
    [
      'ee mentorships',
      `SELECT count(*)::int AS n FROM academic_mentorships m
       JOIN users s ON s.user_id = m.student_user_id
       JOIN departments d ON d.dept_id = s.dept_id
       WHERE d.dept_name = 'Electrical Engg'`,
    ],
    [
      'hod paresh',
      `SELECT u.name FROM departments d
       JOIN users u ON u.user_id = d.hod_user_id
       WHERE d.dept_name = 'Electrical Engg'`,
    ],
    [
      'faculty under paresh',
      `SELECT u.name FROM users u
       JOIN users hod ON hod.user_id = u.reporting_officer_id
       WHERE lower(hod.official_email) = 'paresh.jain@mygyanvihar.com'
         AND u.dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'Electrical Engg')
       ORDER BY u.name`,
    ],
    [
      'raj dept',
      `SELECT d.dept_name FROM users u
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE lower(u.official_email) = 'raj.kumar@mygyanvihar.com'`,
    ],
    [
      'prince enrollments',
      `SELECT c.course_code FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE lower(u.official_email) = 'prince.2547711@mygyanvihar.com'
         AND e.status = 'ENROLLED'
       ORDER BY c.course_code`,
    ],
    [
      'ritu students in EE503P',
      `SELECT u.name FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       JOIN academic_course_allocations a ON a.course_id = c.course_id AND a.status = 'ACTIVE'
       JOIN users f ON f.user_id = a.faculty_user_id
       WHERE c.course_code = 'EE503P'
         AND lower(f.official_email) = 'ritu.jain@mygyanvihar.com'
       ORDER BY u.name`,
    ],
  ];

  let failed = false;
  for (const [label, sql] of checks) {
    const result = await client.query(sql);
    console.log(`\n${label}:`);
    console.log(result.rows);
    if (label === 'ee students with semester' && result.rows[0]?.n !== 7) failed = true;
    if (label === 'ee enrollments' && result.rows[0]?.n < 7 * 8) failed = true;
    if (label === 'ee mentorships' && result.rows[0]?.n !== 7) failed = true;
    if (label === 'prince enrollments' && result.rows.length < 8) failed = true;
    if (label === 'raj dept' && result.rows[0]?.dept_name !== 'Electrical Engg') failed = true;
  }

  await client.end();
  if (failed) {
    console.error('\nVerification FAILED');
    process.exit(1);
  }
  console.log('\nVerification OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
