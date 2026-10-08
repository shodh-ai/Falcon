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
      'civil students with semester',
      `SELECT count(*)::int AS n FROM users u
       JOIN student_profiles sp ON sp.user_id = u.user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Civil'
         AND sp.batch = 'B.Tech CE'
         AND sp.current_semester IN (3, 5, 7)`,
    ],
    [
      'civil allocations',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       WHERE a.program_name = 'B.Tech CE' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    ],
    [
      'civil assigned allocations',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       WHERE a.program_name = 'B.Tech CE' AND a.academic_year = '2026-2027'
         AND a.status = 'ACTIVE' AND a.faculty_user_id IS NOT NULL`,
    ],
    [
      'civil unassigned allocations',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       WHERE a.program_name = 'B.Tech CE' AND a.academic_year = '2026-2027'
         AND a.status = 'ACTIVE' AND a.faculty_user_id IS NULL`,
    ],
    [
      'civil timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE c.course_code LIKE 'CE3%' OR c.course_code LIKE 'CE4%' OR c.course_code LIKE 'CE5%'
          OR c.course_code LIKE 'EM3%' OR c.course_code LIKE 'EM4%' OR c.course_code LIKE 'PT3%'
          OR c.course_code LIKE 'PE4%' OR c.course_code LIKE 'SM4%' OR c.course_code LIKE 'CEUC%'`,
    ],
    [
      'civil enrollments',
      `SELECT count(*)::int AS n FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Civil' AND e.status = 'ENROLLED'`,
    ],
    [
      'civil mentorships',
      `SELECT count(*)::int AS n FROM academic_mentorships m
       JOIN users s ON s.user_id = m.student_user_id
       JOIN departments d ON d.dept_id = s.dept_id
       WHERE d.dept_name = 'Civil'`,
    ],
    [
      'hod ravindra',
      `SELECT u.name FROM departments d
       JOIN users u ON u.user_id = d.hod_user_id
       WHERE d.dept_name = 'Civil'`,
    ],
    [
      'faculty under ravindra',
      `SELECT u.name FROM users u
       JOIN users hod ON hod.user_id = u.reporting_officer_id
       WHERE lower(hod.official_email) = 'ravindra.budania@mygyanvihar.com'
         AND u.dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'Civil')
       ORDER BY u.name`,
    ],
    [
      'roop enrollments',
      `SELECT c.course_code FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE lower(u.official_email) = 'roop.2548471@mygyanvihar.com'
         AND e.status = 'ENROLLED'
       ORDER BY c.course_code`,
    ],
    [
      'jagriti students on CE302T',
      `SELECT u.name FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       JOIN academic_course_allocations a ON a.course_id = c.course_id AND a.status = 'ACTIVE'
       JOIN users f ON f.user_id = a.faculty_user_id
       WHERE c.course_code = 'CE302T'
         AND lower(f.official_email) = 'jagriti.gupta@mygyanvihar.com'
       ORDER BY u.name`,
    ],
  ];

  let failed = false;
  for (const [label, sql] of checks) {
    const result = await client.query(sql);
    console.log(`\n${label}:`);
    console.log(result.rows);
    if (label === 'civil students with semester' && result.rows[0]?.n !== 7) failed = true;
    if (label === 'civil allocations' && result.rows[0]?.n !== 32) failed = true;
    if (label === 'civil enrollments' && result.rows[0]?.n !== 75) failed = true;
    if (label === 'civil mentorships' && result.rows[0]?.n !== 5) failed = true;
    if (label === 'roop enrollments' && result.rows.length !== 12) failed = true;
    if (label === 'jagriti students on CE302T' && result.rows.length !== 3) failed = true;
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
