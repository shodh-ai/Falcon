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
      'pharmacy students with semester',
      `SELECT count(*)::int AS n FROM users u
       JOIN student_profiles sp ON sp.user_id = u.user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Pharmacy'
         AND sp.batch = 'B.Pharm'
         AND sp.current_semester IN (3, 5, 7)`,
    ],
    [
      'pharmacy allocations',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       JOIN users u ON u.user_id = a.faculty_user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Pharmacy'
         AND a.academic_year = '2026-2027'
         AND a.status = 'ACTIVE'`,
    ],
    [
      'pharmacy timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE c.course_code LIKE 'BP%'`,
    ],
    [
      'pharmacy enrollments',
      `SELECT count(*)::int AS n FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Pharmacy' AND e.status = 'ENROLLED'`,
    ],
    [
      'pharmacy mentorships',
      `SELECT count(*)::int AS n FROM academic_mentorships m
       JOIN users s ON s.user_id = m.student_user_id
       JOIN departments d ON d.dept_id = s.dept_id
       WHERE d.dept_name = 'Pharmacy'`,
    ],
    [
      'hod assigned',
      `SELECT u.name, u.official_email
       FROM departments d
       JOIN users u ON u.user_id = d.hod_user_id
       WHERE d.dept_name = 'Pharmacy'`,
    ],
    [
      'faculty under hitesh',
      `SELECT u.name, u.official_email
       FROM users u
       JOIN users hod ON hod.user_id = u.reporting_officer_id
       WHERE lower(hod.official_email) = 'hitesh.kumar@mygyanvihar.com'
         AND u.dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'Pharmacy')
       ORDER BY u.name`,
    ],
    [
      'manish course count',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       JOIN users u ON u.user_id = a.faculty_user_id
       WHERE lower(u.official_email) = 'manish1.gupta@mygyanvihar.com'
         AND a.program_name = 'B.Pharm' AND a.status = 'ACTIVE'`,
    ],
    [
      'lakshya enrollments',
      `SELECT c.course_code, c.course_name
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE lower(u.official_email) = 'lakshya.2548727@mygyanvihar.com'
         AND e.status = 'ENROLLED'
       ORDER BY c.course_code`,
    ],
    [
      'amit students in BP303T',
      `SELECT u.name FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       JOIN academic_course_allocations a ON a.course_id = c.course_id AND a.status = 'ACTIVE'
       JOIN users f ON f.user_id = a.faculty_user_id
       WHERE c.course_code = 'BP303T'
         AND lower(f.official_email) = 'amit.kaushik@mygyanvihar.com'
       ORDER BY u.name`,
    ],
  ];

  let failed = false;
  for (const [label, sql] of checks) {
    const result = await client.query(sql);
    console.log(`\n${label}:`);
    console.log(result.rows);
    if (label === 'pharmacy students with semester' && result.rows[0]?.n !== 17) failed = true;
    if (label === 'pharmacy enrollments' && result.rows[0]?.n < 17 * 6) failed = true;
    if (label === 'pharmacy mentorships' && result.rows[0]?.n !== 17) failed = true;
    if (label === 'lakshya enrollments' && result.rows.length !== 8) failed = true;
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
