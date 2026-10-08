#!/usr/bin/env node
/** Sync student_course_enrollments from academic_course_allocations for a department. */
const { Client } = require('pg');
const { loadEnvFile, dbConfig, loadConfig, deptDir } = require('./lib/utils');
const { syncDepartmentStudents } = require('./lib/enrollment-sync');

loadEnvFile();

async function main() {
  const slug = (process.argv[2] || 'mechanical').toLowerCase();
  const cfg = loadConfig(slug);
  deptDir(slug);

  const client = new Client(dbConfig());
  await client.connect();
  try {
    const tenant = await client.query(
      `SELECT tenant_id FROM tenants WHERE subdomain = $1 LIMIT 1`,
      [cfg.tenant_subdomain],
    );
    const dept = await client.query(
      `SELECT dept_id FROM departments WHERE dept_name = $1 LIMIT 1`,
      [cfg.department_name],
    );
    if (!tenant.rows[0] || !dept.rows[0]) {
      throw new Error('Tenant or department not found');
    }

    const results = await syncDepartmentStudents(
      client,
      tenant.rows[0].tenant_id,
      dept.rows[0].dept_id,
      cfg.academic_year,
    );

    const added = results.reduce((s, r) => s + r.added, 0);
    const courses = results.reduce((s, r) => s + r.courses, 0);
    console.log(`Synced ${results.length} student(s); ${added} new enrollment row(s); ${courses} course slot(s) matched.`);
    results.slice(0, 5).forEach((r) => {
      console.log(`  ${r.email}: +${r.added} courses (${r.courses} matched)`);
    });
    if (results.length > 5) console.log(`  … and ${results.length - 5} more`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
