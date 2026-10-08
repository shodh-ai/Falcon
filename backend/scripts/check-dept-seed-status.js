/**
 * Report schema_migrations + per-department timetable/course seed counts.
 * Usage: node scripts/check-dept-seed-status.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

const DEPT_SEED_MIGRATIONS = [
  { dept: 'Computer Science (AESTR)', file: '20260704140000_real_university_data_seed.sql' },
  { dept: 'Computer Science (AESTR)', file: '20260705120000_semester_course_mapping.sql' },
  { dept: 'Computer Science (AESTR)', file: '20260705140000_full_aestr_workload_allocations.sql' },
  { dept: 'Computer Science (AESTR)', file: '20260706160000_aestr_full_workload_seed.sql' },
  { dept: 'Computer Science (AESTR)', file: '20260704160000_comprehensive_teaching_load_seed.sql' },
  { dept: 'Pharmacy', file: '20260709120000_pharmacy_timetable_workload_seed.sql' },
  { dept: 'Electrical Engg', file: '20260710130000_ee_timetable_workload_seed.sql' },
  { dept: 'Civil', file: '20260711120000_civil_timetable_workload_seed.sql' },
  { dept: 'BPT (Physiotherapy)', file: '20260713120000_physio_timetable_workload_seed.sql' },
  { dept: 'Mech Engg', file: '20260713140000_me_timetable_workload_seed.sql' },
];

const DEPT_DATA_CHECKS = [
  {
    dept: 'Computer Science',
    program: 'BTECH CSE / AESTR',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      JOIN users u ON u.user_id = a.faculty_user_id
      JOIN departments d ON d.dept_id = u.dept_id
      WHERE d.dept_name = 'Computer Science' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      JOIN users u ON u.user_id = t.faculty_user_id
      JOIN departments d ON d.dept_id = u.dept_id
      WHERE d.dept_name = 'Computer Science'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c
      WHERE c.course_code LIKE 'CP%' OR c.course_code LIKE 'CS%' OR c.course_code LIKE 'EM%'`,
  },
  {
    dept: 'Civil',
    program: 'B.Tech CE',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      WHERE a.program_name = 'B.Tech CE' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      WHERE c.course_code LIKE 'CE%'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c WHERE c.course_code LIKE 'CE%'`,
  },
  {
    dept: 'Pharmacy',
    program: 'B.Pharm',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      JOIN users u ON u.user_id = a.faculty_user_id
      JOIN departments d ON d.dept_id = u.dept_id
      WHERE d.dept_name = 'Pharmacy' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      WHERE c.course_code LIKE 'BP%'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c WHERE c.course_code LIKE 'BP%'`,
  },
  {
    dept: 'Electrical Engg',
    program: 'B.Tech EE',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      WHERE a.program_name = 'B.Tech EE' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      WHERE c.course_code LIKE 'EE%'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c WHERE c.course_code LIKE 'EE%'`,
  },
  {
    dept: 'BPT (Physiotherapy)',
    program: 'BPT Batch A',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      WHERE a.program_name = 'BPT' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      WHERE c.course_code LIKE 'BPT%'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c WHERE c.course_code LIKE 'BPT%'`,
  },
  {
    dept: 'Mech Engg',
    program: 'B.Tech ME',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      WHERE a.program_name = 'B.Tech ME' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      WHERE c.course_code LIKE 'ME%' OR c.course_code LIKE 'DME%'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c
      WHERE c.course_code LIKE 'ME%' OR c.course_code LIKE 'DME%'`,
  },
  {
    dept: 'Applied Sciences',
    program: 'B.Sc Applied Sciences',
    allocations: `SELECT count(*)::int AS n FROM academic_course_allocations a
      WHERE a.program_name = 'BSC APPLIED SCIENCES' AND a.academic_year = '2026-2027' AND a.status = 'ACTIVE'`,
    timetables: `SELECT count(*)::int AS n FROM academic_timetables t
      JOIN academic_courses c ON c.course_id = t.course_id
      WHERE c.course_code LIKE 'SAS%'`,
    courses: `SELECT count(*)::int AS n FROM academic_courses c WHERE c.course_code LIKE 'SAS%'`,
  },
];

async function main() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'university_governance',
  };

  console.log(`\n=== DB: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ===\n`);

  const client = new Client(cfg);
  try {
    await client.connect();
  } catch (err) {
    console.error('Could not connect to database:', err.message);
    process.exit(1);
  }

  try {
    const migRes = await client.query(
      `SELECT filename, applied_at FROM schema_migrations
       WHERE filename = ANY($1::text[])
       ORDER BY filename`,
      [DEPT_SEED_MIGRATIONS.map((m) => m.file)],
    );
    const applied = new Map(migRes.rows.map((r) => [r.filename, r.applied_at]));

    console.log('--- Migration status (department seeds) ---');
    for (const row of DEPT_SEED_MIGRATIONS) {
      const when = applied.get(row.file);
      console.log(
        `${when ? 'APPLIED' : 'MISSING '} | ${row.dept.padEnd(22)} | ${row.file}${when ? ` (${when.toISOString?.() ?? when})` : ''}`,
      );
    }

    console.log('\n--- Data counts in DB ---');
    for (const check of DEPT_DATA_CHECKS) {
      const alloc = (await client.query(check.allocations)).rows[0]?.n ?? 0;
      const tt = (await client.query(check.timetables)).rows[0]?.n ?? 0;
      const courses = (await client.query(check.courses)).rows[0]?.n ?? 0;
      const status = alloc > 0 && tt > 0 && courses > 0 ? 'FED' : alloc + tt + courses > 0 ? 'PARTIAL' : 'EMPTY';
      console.log(
        `${status.padEnd(8)} | ${check.dept.padEnd(18)} | courses=${courses} allocations=${alloc} timetables=${tt} (${check.program})`,
      );
    }

    const latest = await client.query(
      `SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 5`,
    );
    console.log('\n--- Latest 5 migrations applied ---');
    for (const r of latest.rows) {
      console.log(`  ${r.applied_at.toISOString()} | ${r.filename}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
