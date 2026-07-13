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

  const faculty = [
    { label: 'raj (multi-dept)', email: 'raj.kumar@mygyanvihar.com' },
    { label: 'amit (single-dept)', email: 'amit.tiwari@mygyanvihar.com' },
  ];

  const ALLOCATION_WITH_DEPT_FROM = `
    FROM academic_course_allocations a
    INNER JOIN users u ON u.user_id = a.faculty_user_id
    LEFT JOIN academic_courses c ON c.course_id = a.course_id AND c.tenant_id = a.tenant_id
    LEFT JOIN iam_programs p
      ON p.deleted_at IS NULL
     AND (
       upper(replace(COALESCE(p.program_name, ''), ' ', '')) = upper(replace(COALESCE(a.program_name, ''), ' ', ''))
       OR upper(replace(COALESCE(p.program_code, ''), ' ', '')) = upper(replace(COALESCE(a.program_name, ''), ' ', ''))
     )
    LEFT JOIN LATERAL (
      SELECT d.dept_id
      FROM departments d
      WHERE d.dept_name = CASE
        WHEN c.course_code LIKE 'ME%' OR c.course_code LIKE 'DME%' THEN 'Mech Engg'
        WHEN c.course_code LIKE 'EE%' THEN 'Electrical Engg'
        ELSE NULL
      END
      LIMIT 1
    ) code_dept ON true
  `;

  let failed = false;
  for (const person of faculty) {
    const userRes = await client.query(
      `SELECT user_id, dept_id FROM users WHERE lower(official_email) = lower($1)`,
      [person.email],
    );
    const user = userRes.rows[0];
    if (!user) {
      console.error(`Missing user: ${person.email}`);
      failed = true;
      continue;
    }

    const deptRes = await client.query(
      `WITH allocation_depts AS (
         SELECT DISTINCT COALESCE(p.dept_id, code_dept.dept_id, u.dept_id) AS dept_id
         ${ALLOCATION_WITH_DEPT_FROM}
         WHERE a.faculty_user_id = $1
           AND a.status = 'ACTIVE'
           AND a.course_id IS NOT NULL
       )
       SELECT d.dept_id, d.dept_name, COUNT(*)::int AS course_count
       FROM allocation_depts ad
       JOIN departments d ON d.dept_id = ad.dept_id
       GROUP BY d.dept_id, d.dept_name
       ORDER BY d.dept_name`,
      [user.user_id],
    );

    console.log(`\n${person.label} (${person.email}):`);
    console.log(deptRes.rows);

    if (person.label.includes('raj') && deptRes.rows.length < 2) failed = true;
    if (person.label.includes('amit') && deptRes.rows.length !== 1) failed = true;

    if (person.label.includes('raj') && deptRes.rows.length >= 2) {
      for (const dept of deptRes.rows) {
        const courses = await client.query(
          `SELECT COUNT(DISTINCT a.course_id)::int AS n
           ${ALLOCATION_WITH_DEPT_FROM}
           WHERE a.faculty_user_id = $1
             AND a.status = 'ACTIVE'
             AND a.course_id IS NOT NULL
             AND COALESCE(p.dept_id, code_dept.dept_id, u.dept_id) = $2`,
          [user.user_id, dept.dept_id],
        );
        console.log(`  filtered ${dept.dept_name}: ${courses.rows[0].n} courses`);
        if (courses.rows[0].n === 0) failed = true;
      }
    }
  }

  await client.end();
  if (failed) {
    console.error('\nTeaching department verification FAILED');
    process.exit(1);
  }
  console.log('\nTeaching department verification OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
