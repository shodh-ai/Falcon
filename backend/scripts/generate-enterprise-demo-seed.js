#!/usr/bin/env node
/**
 * generate-enterprise-demo-seed.js
 *
 * Generates scalable demo seed SQL for Falcon Campus OS (schools, departments,
 * faculty, students). Outputs a .sql file — does NOT execute against a database.
 *
 * Usage:
 *   node scripts/generate-enterprise-demo-seed.js [options]
 *
 * Options:
 *   --schools=N        Number of schools (default: 2)
 *   --departments=N    Total departments across all schools (default: 6)
 *   --faculty=N        Total faculty users (default: 30)
 *   --students=N       Total student users (default: 500)
 *   --tenant-id=UUID   Tenant UUID (default: SGVU demo tenant)
 *   --output=PATH      Output SQL file (default: scripts/output/enterprise-demo-seed.sql)
 *   --academic-year=Y  Academic year label (default: 2026-2027)
 *   --help             Show help
 *
 * Examples:
 *   node scripts/generate-enterprise-demo-seed.js
 *   node scripts/generate-enterprise-demo-seed.js --schools=3 --departments=12 --faculty=60 --students=2000
 *   node scripts/generate-enterprise-demo-seed.js --output=/tmp/demo.sql
 *
 * CI note: safe to run in CI — writes SQL only, no DB connection required.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── CLI parsing ───────────────────────────────────────────────────────────

const DEFAULTS = {
  schools: 2,
  departments: 6,
  faculty: 30,
  students: 500,
  tenantId: 'a0000000-0000-4000-8000-000000000001',
  academicYear: '2026-2027',
  output: path.join(__dirname, 'output', 'enterprise-demo-seed.sql'),
};

const SCHOOL_NAMES = [
  { name: 'School of Engineering & Technology', code: 'SET' },
  { name: 'School of Management', code: 'SOM' },
  { name: 'School of Applied Sciences', code: 'SAS' },
  { name: 'School of Pharmacy', code: 'SOP' },
  { name: 'School of Law', code: 'SOL' },
  { name: 'School of Agriculture', code: 'SOA' },
];

const DEPT_TEMPLATES = [
  'Computer Science', 'Mechanical Engineering', 'Electrical Engineering',
  'Civil Engineering', 'Electronics & Communication', 'Information Technology',
  'MBA', 'BBA', 'Physics', 'Chemistry', 'Mathematics', 'Biotechnology',
  'Pharmacy', 'Law', 'Agriculture', 'Architecture', 'Automobile Engineering',
  'Data Science', 'AI & ML', 'Cyber Security',
];

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) continue;
    const [, key, val] = match;
    switch (key) {
      case 'schools': opts.schools = clampInt(val, 1, 20); break;
      case 'departments': opts.departments = clampInt(val, 1, 100); break;
      case 'faculty': opts.faculty = clampInt(val, 1, 5000); break;
      case 'students': opts.students = clampInt(val, 1, 50000); break;
      case 'tenant-id': opts.tenantId = val; break;
      case 'academic-year': opts.academicYear = val; break;
      case 'output': opts.output = val; break;
      default: console.warn(`Unknown option: --${key}`);
    }
  }
  return opts;
}

function clampInt(val, min, max) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function printHelp() {
  console.log(fs.readFileSync(__filename, 'utf8').match(/\/\*\*[\s\S]*?\*\//)[0]);
}

function uuid() {
  return crypto.randomUUID();
}

function esc(str) {
  return String(str).replace(/'/g, "''");
}

function padNum(n, width) {
  return String(n).padStart(width, '0');
}

// ─── Generators ──────────────────────────────────────────────────────────────

function generateSchools(count) {
  const schools = [];
  for (let i = 0; i < count; i++) {
    const tmpl = SCHOOL_NAMES[i % SCHOOL_NAMES.length];
    schools.push({
      school_id: 1000 + i,
      school_name: tmpl.name,
      school_code: `${tmpl.code}${i > SCHOOL_NAMES.length - 1 ? i : ''}`,
      dean_user_id: null, // assigned after faculty creation
    });
  }
  return schools;
}

function generateDepartments(schools, totalDepts) {
  const departments = [];
  const perSchool = Math.ceil(totalDepts / schools.length);
  let deptIdx = 0;
  for (const school of schools) {
    const count = Math.min(perSchool, totalDepts - deptIdx);
    for (let d = 0; d < count; d++) {
      const tmpl = DEPT_TEMPLATES[deptIdx % DEPT_TEMPLATES.length];
      departments.push({
        dept_id: 2000 + deptIdx,
        dept_name: `${tmpl}${deptIdx >= DEPT_TEMPLATES.length ? ` ${Math.floor(deptIdx / DEPT_TEMPLATES.length) + 1}` : ''}`,
        dept_code: `DEPT-${padNum(deptIdx + 1, 3)}`,
        school_id: school.school_id,
        hod_user_id: null,
      });
      deptIdx++;
      if (deptIdx >= totalDepts) break;
    }
    if (deptIdx >= totalDepts) break;
  }
  return departments;
}

function generateFaculty(count, departments, tenantId) {
  const faculty = [];
  for (let i = 0; i < count; i++) {
    const dept = departments[i % departments.length];
    const userId = uuid();
    faculty.push({
      user_id: userId,
      email: `faculty.demo.${padNum(i + 1, 4)}@demo.mygyanvihar.com`,
      full_name: `Demo Faculty ${i + 1}`,
      role: i % 10 === 0 ? 'HOD' : 'Faculty',
      dept_id: dept.dept_id,
      employee_code: `FAC-${padNum(i + 1, 5)}`,
    });
  }
  // Assign HODs
  for (const dept of departments) {
    const hod = faculty.find((f) => f.dept_id === dept.dept_id && f.role === 'HOD');
    if (hod) dept.hod_user_id = hod.user_id;
    else if (faculty.length) {
      const fallback = faculty[departments.indexOf(dept) % faculty.length];
      dept.hod_user_id = fallback.user_id;
      fallback.role = 'HOD';
    }
  }
  return faculty;
}

function generateStudents(count, departments, tenantId, academicYear) {
  const students = [];
  for (let i = 0; i < count; i++) {
    const dept = departments[i % departments.length];
    const userId = uuid();
    const batchYear = 2022 + (i % 4);
    students.push({
      user_id: userId,
      email: `student.demo.${padNum(i + 1, 5)}@demo.mygyanvihar.com`,
      full_name: `Demo Student ${i + 1}`,
      role: 'Student',
      dept_id: dept.dept_id,
      enrollment_no: `SGVU${batchYear}${padNum(i + 1, 6)}`,
      batch: `${batchYear}-${batchYear + 4}`,
      semester: (i % 8) + 1,
      academic_year: academicYear,
    });
  }
  return students;
}

function assignDeans(schools, faculty) {
  const hods = faculty.filter((f) => f.role === 'HOD');
  for (let i = 0; i < schools.length; i++) {
    schools[i].dean_user_id = hods[i % hods.length]?.user_id ?? faculty[0]?.user_id ?? null;
  }
}

// ─── SQL emission ────────────────────────────────────────────────────────────

function emitSql(opts, schools, departments, faculty, students) {
  const lines = [];
  const ts = new Date().toISOString();

  lines.push('-- ═══════════════════════════════════════════════════════════════════');
  lines.push('-- Falcon Campus OS — Enterprise Demo Seed');
  lines.push(`-- Generated: ${ts}`);
  lines.push(`-- Parameters: schools=${opts.schools}, departments=${opts.departments}, faculty=${opts.faculty}, students=${opts.students}`);
  lines.push(`-- Tenant: ${opts.tenantId}`);
  lines.push('-- WARNING: Demo data only. Do not run on production without review.');
  lines.push('-- ═══════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // Roles (idempotent)
  lines.push('-- ─── Roles (skip if exists) ───');
  for (const role of ['Faculty', 'HOD', 'Dean', 'Student', 'ExamCell']) {
    lines.push(`INSERT INTO roles (role_name) VALUES ('${role}') ON CONFLICT DO NOTHING;`);
  }
  lines.push('');

  // Schools
  lines.push('-- ─── Schools ───');
  for (const s of schools) {
    lines.push(
      `INSERT INTO schools (school_id, tenant_id, school_name, school_code, dean_user_id, created_at, updated_at)`,
    );
    lines.push(
      `VALUES (${s.school_id}, '${opts.tenantId}', '${esc(s.school_name)}', '${esc(s.school_code)}', ${s.dean_user_id ? `'${s.dean_user_id}'` : 'NULL'}, NOW(), NOW())`,
    );
    lines.push(`ON CONFLICT (school_id) DO UPDATE SET school_name = EXCLUDED.school_name, dean_user_id = EXCLUDED.dean_user_id;`);
  }
  lines.push('');

  // Departments
  lines.push('-- ─── Departments ───');
  for (const d of departments) {
    lines.push(
      `INSERT INTO departments (dept_id, tenant_id, dept_name, dept_code, school_id, hod_user_id, created_at, updated_at)`,
    );
    lines.push(
      `VALUES (${d.dept_id}, '${opts.tenantId}', '${esc(d.dept_name)}', '${esc(d.dept_code)}', ${d.school_id}, ${d.hod_user_id ? `'${d.hod_user_id}'` : 'NULL'}, NOW(), NOW())`,
    );
    lines.push(`ON CONFLICT (dept_id) DO UPDATE SET dept_name = EXCLUDED.dept_name, hod_user_id = EXCLUDED.hod_user_id;`);
  }
  lines.push('');

  // Faculty users
  lines.push('-- ─── Faculty users ───');
  for (const f of faculty) {
    lines.push(
      `INSERT INTO users (user_id, tenant_id, email, full_name, role_id, dept_id, onboarding_status, created_at, updated_at)`,
    );
    lines.push(
      `SELECT '${f.user_id}', '${opts.tenantId}', '${esc(f.email)}', '${esc(f.full_name)}', r.role_id, ${f.dept_id}, 'COMPLETED', NOW(), NOW()`,
    );
    lines.push(`FROM roles r WHERE r.role_name = '${f.role === 'HOD' ? 'HOD' : 'Faculty'}' LIMIT 1;`);
    lines.push(
      `INSERT INTO user_roles (user_id, role_id) SELECT '${f.user_id}', r.role_id FROM roles r WHERE r.role_name IN ('${f.role === 'HOD' ? 'HOD' : 'Faculty'}') ON CONFLICT DO NOTHING;`,
    );
  }
  lines.push('');

  // Dean user roles for school deans
  lines.push('-- ─── Dean role assignments ───');
  const deanUserIds = [...new Set(schools.map((s) => s.dean_user_id).filter(Boolean))];
  for (const deanId of deanUserIds) {
    lines.push(
      `INSERT INTO user_roles (user_id, role_id) SELECT '${deanId}', r.role_id FROM roles r WHERE r.role_name = 'Dean' ON CONFLICT DO NOTHING;`,
    );
  }
  lines.push('');

  // Student users
  lines.push('-- ─── Student users ───');
  for (const s of students) {
    lines.push(
      `INSERT INTO users (user_id, tenant_id, email, full_name, role_id, dept_id, onboarding_status, created_at, updated_at)`,
    );
    lines.push(
      `SELECT '${s.user_id}', '${opts.tenantId}', '${esc(s.email)}', '${esc(s.full_name)}', r.role_id, ${s.dept_id}, 'COMPLETED', NOW(), NOW()`,
    );
    lines.push(`FROM roles r WHERE r.role_name = 'Student' LIMIT 1;`);
    lines.push(
      `INSERT INTO user_roles (user_id, role_id) SELECT '${s.user_id}', r.role_id FROM roles r WHERE r.role_name = 'Student' ON CONFLICT DO NOTHING;`,
    );
    lines.push(
      `INSERT INTO student_profiles (user_id, tenant_id, enrollment_no, batch, current_semester, academic_year, created_at, updated_at)`,
    );
    lines.push(
      `VALUES ('${s.user_id}', '${opts.tenantId}', '${esc(s.enrollment_no)}', '${esc(s.batch)}', ${s.semester}, '${esc(s.academic_year)}', NOW(), NOW())`,
    );
    lines.push(`ON CONFLICT (user_id) DO UPDATE SET enrollment_no = EXCLUDED.enrollment_no, current_semester = EXCLUDED.current_semester;`);
  }
  lines.push('');

  // Summary comment
  lines.push('-- ─── Summary ───');
  lines.push(`-- Schools: ${schools.length}`);
  lines.push(`-- Departments: ${departments.length}`);
  lines.push(`-- Faculty: ${faculty.length} (${faculty.filter((f) => f.role === 'HOD').length} HODs)`);
  lines.push(`-- Students: ${students.length}`);
  lines.push(`-- Deans assigned: ${deanUserIds.length}`);
  lines.push('');

  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('Falcon Enterprise Demo Seed Generator');
  console.log('─────────────────────────────────────');
  console.log(`  Schools:      ${opts.schools}`);
  console.log(`  Departments:  ${opts.departments}`);
  console.log(`  Faculty:      ${opts.faculty}`);
  console.log(`  Students:     ${opts.students}`);
  console.log(`  Tenant:       ${opts.tenantId}`);
  console.log(`  Output:       ${opts.output}`);
  console.log('');

  const schools = generateSchools(opts.schools);
  const departments = generateDepartments(schools, opts.departments);
  const faculty = generateFaculty(opts.faculty, departments, opts.tenantId);
  assignDeans(schools, faculty);
  const students = generateStudents(opts.students, departments, opts.tenantId, opts.academicYear);

  const sql = emitSql(opts, schools, departments, faculty, students);

  const outDir = path.dirname(opts.output);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(opts.output, sql, 'utf8');

  console.log(`✓ Generated ${opts.output}`);
  console.log(`  ${schools.length} schools, ${departments.length} departments, ${faculty.length} faculty, ${students.length} students`);
  console.log('');
  console.log('Apply manually:');
  console.log(`  psql "$DATABASE_URL" -f ${opts.output}`);
}

main();
