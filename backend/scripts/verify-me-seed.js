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
      'me batch A students',
      `SELECT count(*)::int AS n FROM users u
       JOIN student_profiles sp ON sp.user_id = u.user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Mech Engg'
         AND sp.batch = 'B.Tech ME'
         AND sp.section_code = 'A'
         AND sp.current_semester IN (3, 5, 7)`,
    ],
    [
      'me allocations',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       WHERE a.program_name = 'B.Tech ME' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    ],
    [
      'me timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE c.course_code LIKE 'ME%' OR c.course_code LIKE 'UC%' OR c.course_code LIKE 'EM%'
         OR c.course_code LIKE 'DME%' OR c.course_code LIKE 'PE%' OR c.course_code LIKE 'SM%'
         OR c.course_code LIKE 'PT%' OR c.course_code LIKE 'UCFV%' OR c.course_code LIKE 'AE%'`,
    ],
    [
      'me enrollments',
      `SELECT count(*)::int AS n FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN departments d ON d.dept_id = u.dept_id
       WHERE d.dept_name = 'Mech Engg' AND e.status = 'ENROLLED'`,
    ],
    [
      'me mentorships',
      `SELECT count(*)::int AS n FROM academic_mentorships m
       JOIN users s ON s.user_id = m.student_user_id
       JOIN departments d ON d.dept_id = s.dept_id
       WHERE d.dept_name = 'Mech Engg'`,
    ],
    [
      'hod assigned',
      `SELECT u.name, u.official_email
       FROM departments d
       JOIN users u ON u.user_id = d.hod_user_id
       WHERE d.dept_name = 'Mech Engg'`,
    ],
    [
      'faculty under neeraj',
      `SELECT u.name, u.official_email
       FROM users u
       JOIN users hod ON hod.user_id = u.reporting_officer_id
       WHERE lower(hod.official_email) = 'neeraj.kumar1@mygyanvihar.com'
         AND u.dept_id = (SELECT dept_id FROM departments WHERE dept_name = 'Mech Engg')
       ORDER BY u.name`,
    ],
    [
      'amit course count',
      `SELECT count(*)::int AS n FROM academic_course_allocations a
       JOIN users u ON u.user_id = a.faculty_user_id
       WHERE lower(u.official_email) = 'amit.tiwari@mygyanvihar.com'
         AND a.program_name = 'B.Tech ME' AND a.status = 'ACTIVE'`,
    ],
    [
      'anshuman enrollments',
      `SELECT c.course_code, c.course_name
       FROM student_course_enrollments e
       JOIN users u ON u.user_id = e.student_user_id
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE lower(u.official_email) = 'anshuman.2549873@mygyanvihar.com'
         AND e.status = 'ENROLLED'
       ORDER BY c.course_code`,
    ],
    [
      'amit timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN users u ON u.user_id = t.faculty_user_id
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE lower(u.official_email) = 'amit.tiwari@mygyanvihar.com'
         AND (c.course_code LIKE 'ME%' OR c.course_code LIKE 'UC%' OR c.course_code LIKE 'DME%')`,
    ],
    [
      'himanshu timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN users u ON u.user_id = t.faculty_user_id
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE lower(u.official_email) = 'himanshu.vasnani@mygyanvihar.com'
         AND (c.course_code LIKE 'ME%' OR c.course_code LIKE 'EM%')`,
    ],
    [
      'raj timetable slots',
      `SELECT count(*)::int AS n FROM academic_timetables t
       JOIN users u ON u.user_id = t.faculty_user_id
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE lower(u.official_email) = 'raj.kumar@mygyanvihar.com'
         AND (c.course_code LIKE 'ME%' OR c.course_code LIKE 'UC%' OR c.course_code LIKE 'DME%')`,
    ],
  ];

  let failed = false;
  for (const [label, sql] of checks) {
    const result = await client.query(sql);
    console.log(`\n${label}:`);
    console.log(result.rows);
    if (label === 'me batch A students' && result.rows[0]?.n < 6) failed = true;
    if (label === 'me enrollments' && result.rows[0]?.n < 30) failed = true;
    if (label === 'me mentorships' && result.rows[0]?.n < 6) failed = true;
    if (label === 'anshuman enrollments' && result.rows.length < 5) failed = true;
    if (label === 'amit timetable slots' && result.rows[0]?.n < 5) failed = true;
    if (label === 'hod assigned' && !result.rows[0]?.official_email?.includes('neeraj')) failed = true;
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
