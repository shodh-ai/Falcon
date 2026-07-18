const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  loadEnvFile,
  dbConfig,
  readCsv,
  normalizeCode,
  normalizeSubType,
  loadConfig,
  deptDir,
  writeMarkdown,
  renderReport,
  tableFromRows,
  DOCS_ROOT,
} = require('./lib/utils');

loadEnvFile();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;

function parseArgs(argv) {
  const args = argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  return {
    slug: slug ? slug.toLowerCase() : null,
    dryRun: args.includes('--dry-run'),
    strict: args.includes('--strict'),
    skipParse: args.includes('--skip-parse'),
  };
}

function validateStudents(rows) {
  const errors = [];
  const duplicates = [];
  const warnings = [];
  const seen = new Set();

  for (const row of rows) {
    const email = row.email?.toLowerCase();
    if (!row.student_name) {
      errors.push({ line: row._line, type: 'MISSING_NAME', message: 'Student name is required' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      errors.push({ line: row._line, type: 'MISSING_EMAIL', message: `Invalid email: ${email || '(empty)'}` });
    }
    if (seen.has(email)) {
      duplicates.push({ line: row._line, email, message: 'Duplicate student email in source file' });
    } else if (email) {
      seen.add(email);
    }
    if (!row.current_semester) {
      warnings.push({ line: row._line, type: 'MISSING_SEMESTER', message: 'Current semester missing' });
    } else if (Number.isNaN(Number(row.current_semester))) {
      errors.push({ line: row._line, type: 'INVALID_SEMESTER', message: `Invalid semester: ${row.current_semester}` });
    }
  }
  return { errors, duplicates, warnings };
}

function validateWorkload(rows) {
  const errors = [];
  const duplicates = [];
  const warnings = [];
  const seen = new Set();

  for (const row of rows) {
    const code = normalizeCode(row.course_code);
    const email = row.faculty_email?.toLowerCase();
    const key = `${email}|${code}|${row.semester}|${row.programme}`;

    if (!code || !CODE_RE.test(code)) {
      errors.push({ line: row._line, type: 'INVALID_COURSE_CODE', message: `Invalid course code: ${row.course_code}` });
    }
    if (!row.course_name) {
      errors.push({ line: row._line, type: 'MISSING_COURSE_NAME', message: 'Course name is required' });
    }
    const credits = Number(row.credits);
    if (Number.isNaN(credits) || credits <= 0) {
      errors.push({ line: row._line, type: 'INVALID_CREDITS', message: `Invalid credits: ${row.credits}` });
    }
    if (!row.semester) {
      errors.push({ line: row._line, type: 'MISSING_SEMESTER', message: 'Semester is required' });
    }
    if (!row.programme) {
      errors.push({ line: row._line, type: 'MISSING_PROGRAMME', message: 'Programme is required' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      errors.push({ line: row._line, type: 'MISSING_FACULTY', message: `Missing faculty email for ${row.faculty_name}` });
    }
    if (seen.has(key)) {
      duplicates.push({ line: row._line, key, message: 'Duplicate workload assignment in source file' });
    } else {
      seen.add(key);
    }
    if (!row.faculty_name) {
      warnings.push({ line: row._line, type: 'MISSING_FACULTY_NAME', message: 'Faculty name missing' });
    }
  }
  return { errors, duplicates, warnings };
}

async function resolveTenant(client, subdomain) {
  const { rows } = await client.query(
    `SELECT tenant_id FROM tenants WHERE lower(subdomain) = lower($1) LIMIT 1`,
    [subdomain],
  );
  if (!rows[0]) throw new Error(`Tenant not found for subdomain: ${subdomain}`);
  return rows[0].tenant_id;
}

async function resolveDepartment(client, deptName) {
  const { rows } = await client.query(
    `SELECT dept_id, dept_name FROM departments
     WHERE lower(dept_name) = lower($1) LIMIT 1`,
    [deptName],
  );
  if (!rows[0]) throw new Error(`Department not found: ${deptName}`);
  return rows[0];
}

async function ensureProgram(client, cfg, deptId) {
  await client.query(
    `INSERT INTO iam_programs (program_name, program_code, duration_years, dept_id)
     SELECT $1::varchar, $2::varchar, 4, $3::int
     WHERE NOT EXISTS (
       SELECT 1 FROM iam_programs
       WHERE upper(program_code) = upper($2::varchar) AND deleted_at IS NULL
     )`,
    [cfg.program_display_name, cfg.program_code, Number(deptId)],
  );

  const existing = await client.query(
    `SELECT program_id FROM iam_programs
     WHERE upper(program_code) = upper($1) AND deleted_at IS NULL
     LIMIT 1`,
    [cfg.program_code],
  );
  if (existing.rows[0]) return existing.rows[0].program_id;

  const byName = await client.query(
    `SELECT program_id FROM iam_programs
     WHERE lower(program_name) = lower($1) AND deleted_at IS NULL
     LIMIT 1`,
    [cfg.program_display_name],
  );
  return byName.rows[0]?.program_id ?? 1;
}

const DEFAULT_PASSWORD_HASH =
  process.env.DEPARTMENT_IMPORT_DEFAULT_PASSWORD_HASH ||
  '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';

async function resolveDefaultEntityId(client, tenantId) {
  const { rows } = await client.query(
    `SELECT entity_id FROM org_entities
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY entity_id LIMIT 1`,
    [tenantId],
  );
  if (!rows[0]) throw new Error('No organization entity found for tenant');
  return Number(rows[0].entity_id);
}

async function resolveDepartmentHod(client, deptId) {
  const { rows } = await client.query(
    `SELECT hod_user_id FROM departments WHERE dept_id = $1 LIMIT 1`,
    [deptId],
  );
  return rows[0]?.hod_user_id || null;
}

async function ensureFacultyUser(client, tenantId, deptId, row, cfg, report) {
  const email = row.faculty_email?.toLowerCase();
  if (!email) return null;

  let faculty = await resolveFaculty(client, tenantId, email);
  if (faculty) {
    await client.query(
      `UPDATE users SET name = $1, dept_id = COALESCE(dept_id, $2), updated_at = NOW()
       WHERE user_id = $3 AND tenant_id = $4`,
      [row.faculty_name, deptId, faculty.user_id, tenantId],
    );
    report.faculty.updated.push({ email, name: row.faculty_name });
    return faculty;
  }

  const existingUser = await client.query(
    `SELECT user_id FROM users
     WHERE tenant_id = $1 AND lower(official_email) = lower($2) AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, email],
  );
  if (existingUser.rows[0]) {
    const role = await client.query(
      `SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1`,
    );
    await client.query(
      `UPDATE users SET name = $1, role_id = $2, dept_id = $3, is_active = true,
         password_hash = COALESCE(password_hash, $4), updated_at = NOW()
       WHERE user_id = $5`,
      [
        row.faculty_name,
        role.rows[0].role_id,
        deptId,
        DEFAULT_PASSWORD_HASH,
        existingUser.rows[0].user_id,
      ],
    );
    report.faculty.updated.push({ email, name: row.faculty_name });
    return {
      user_id: existingUser.rows[0].user_id,
      name: row.faculty_name,
      official_email: email,
      dept_id: deptId,
    };
  }

  if (cfg.provision_missing_faculty === false) {
    return null;
  }

  const designation = (row.designation || '').toUpperCase();
  const roleName =
    designation.includes('HOD') || designation.includes('DEAN') ? 'HOD' : 'Faculty';
  const entityId = await resolveDefaultEntityId(client, tenantId);
  const hodUserId = await resolveDepartmentHod(client, deptId);

  const role = await client.query(
    `SELECT role_id FROM roles WHERE role_name = $1 LIMIT 1`,
    [roleName === 'HOD' ? 'HOD' : 'Faculty'],
  );
  if (!role.rows[0]) throw new Error(`Role not found: ${roleName}`);

  const inserted = await client.query(
    `INSERT INTO users (
       tenant_id, name, official_email, role_id, dept_id, entity_id,
       password_hash, reporting_officer_id, is_active, onboarding_status, onboarding_profile
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'COMPLETED', '{}'::jsonb)
     ON CONFLICT (tenant_id, official_email) DO UPDATE SET
       name = EXCLUDED.name,
       role_id = EXCLUDED.role_id,
       dept_id = EXCLUDED.dept_id,
       password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
       is_active = true,
       updated_at = NOW()
     RETURNING user_id, (xmax = 0) AS inserted`,
    [
      tenantId,
      row.faculty_name,
      email,
      role.rows[0].role_id,
      deptId,
      entityId,
      DEFAULT_PASSWORD_HASH,
      hodUserId,
    ],
  );

  const userId = inserted.rows[0].user_id;
  await client.query(
    `INSERT INTO user_roles (user_id, role_id, is_primary)
     VALUES ($1, $2, true)
     ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [userId, role.rows[0].role_id],
  );

  if (inserted.rows[0].inserted) {
    report.faculty.created.push({
      email,
      name: row.faculty_name,
      default_password: process.env.DEPARTMENT_IMPORT_DEFAULT_PASSWORD || 'password123',
    });
    report.rollback.faculty_user_ids.push(userId);
  } else {
    report.faculty.updated.push({ email, name: row.faculty_name });
  }

  return { user_id: userId, name: row.faculty_name, official_email: email, dept_id: deptId };
}

async function resolveFaculty(client, tenantId, email) {
  const { rows } = await client.query(
    `SELECT u.user_id, u.name, u.official_email, u.dept_id
     FROM users u
     INNER JOIN roles r ON r.role_id = u.role_id
     WHERE u.tenant_id = $1
       AND lower(u.official_email) = lower($2)
       AND u.is_active = true
       AND u.deleted_at IS NULL
       AND r.role_name IN ('Faculty', 'HOD', 'Dean')
     LIMIT 1`,
    [tenantId, email],
  );
  return rows[0] || null;
}

function extractEnrollmentNo(email) {
  const local = email.split('@')[0] || email;
  const match = local.match(/(\d{5,})/);
  if (match) return match[1];
  return local.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 20) || 'STU';
}

/** Official student imports must always land in the Student portal, not Faculty/HOD. */
async function ensureStudentRole(client, tenantId, userId, report, email) {
  const role = await client.query(
    `SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1`,
  );
  if (!role.rows[0]) throw new Error('Student role not found');
  const studentRoleId = role.rows[0].role_id;

  const current = await client.query(
    `SELECT r.role_name
     FROM users u
     LEFT JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = $1 AND u.tenant_id = $2`,
    [userId, tenantId],
  );
  const previousRole = current.rows[0]?.role_name;

  await client.query(
    `UPDATE users
     SET role_id = $1,
         onboarding_status = 'COMPLETED',
         updated_at = NOW()
     WHERE user_id = $2 AND tenant_id = $3`,
    [studentRoleId, userId, tenantId],
  );

  await client.query(
    `DELETE FROM user_roles ur
     USING roles r
     WHERE ur.role_id = r.role_id
       AND ur.user_id = $1
       AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'HR', 'HRAdmin')`,
    [userId],
  );

  await client.query(
    `INSERT INTO user_roles (user_id, role_id, is_primary)
     VALUES ($1, $2, true)
     ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [userId, studentRoleId],
  );

  if (previousRole && previousRole !== 'Student') {
    if (!report.students.role_corrected) report.students.role_corrected = [];
    report.students.role_corrected.push({
      email,
      from: previousRole,
      to: 'Student',
    });
  }
}

async function upsertStudent(client, tenantId, deptId, row, cfg, report) {
  const email = row.email.toLowerCase();
  const existing = await client.query(
    `SELECT u.user_id, sp.batch, sp.current_semester, sp.section_code
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
     WHERE u.tenant_id = $1 AND lower(u.official_email) = $2
     LIMIT 1`,
    [tenantId, email],
  );

  const semester = Number(row.current_semester) || null;
  const batch = row.batch || row.programme;
  const section = row.section_code || 'A';
  const enrollmentNo = extractEnrollmentNo(email);
  const defaultPassword =
    process.env.DEPARTMENT_IMPORT_DEFAULT_PASSWORD || 'password123';

  if (!existing.rows[0]) {
    if (cfg.provision_missing_students === false) {
      report.students.skipped.push({
        email,
        name: row.student_name,
        reason: 'User account not found — student provisioning disabled in config',
      });
      return;
    }

    const entityId = await resolveDefaultEntityId(client, tenantId);
    const role = await client.query(
      `SELECT role_id FROM roles WHERE role_name = 'Student' LIMIT 1`,
    );
    if (!role.rows[0]) throw new Error('Student role not found');

    const inserted = await client.query(
      `INSERT INTO users (
         tenant_id, name, official_email, role_id, dept_id, entity_id,
         password_hash, is_active, onboarding_status, onboarding_profile
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'COMPLETED', '{}'::jsonb)
       RETURNING user_id`,
      [
        tenantId,
        row.student_name,
        email,
        role.rows[0].role_id,
        deptId,
        entityId,
        DEFAULT_PASSWORD_HASH,
      ],
    );
    const userId = inserted.rows[0].user_id;
    await ensureStudentRole(client, tenantId, userId, report, email);

    await client.query(
      `INSERT INTO student_profiles (
         tenant_id, user_id, prn_number, enrollment_no, batch,
         current_semester, section_code, status
       ) VALUES ($1, $2, $3, $3, $4, $5, $6, 'ACTIVE')`,
      [tenantId, userId, enrollmentNo, batch, semester, section],
    );

    report.students.created.push({
      email,
      name: row.student_name,
      enrollment_no: enrollmentNo,
      semester,
      section,
      batch,
      default_password: defaultPassword,
    });
    report.rollback.student_user_ids.push(userId);
    return;
  }

  const userId = existing.rows[0].user_id;
  const before = {
    batch: existing.rows[0].batch,
    current_semester: existing.rows[0].current_semester,
    section_code: existing.rows[0].section_code,
  };

  await ensureStudentRole(client, tenantId, userId, report, email);

  await client.query(
    `UPDATE users SET name = $1, dept_id = $2,
       password_hash = COALESCE(password_hash, $3), is_active = true, updated_at = NOW()
     WHERE user_id = $4 AND tenant_id = $5`,
    [row.student_name, deptId, DEFAULT_PASSWORD_HASH, userId, tenantId],
  );

  await client.query(
    `INSERT INTO student_profiles (tenant_id, user_id, prn_number, enrollment_no, batch, current_semester, section_code, status)
     VALUES ($1, $2, $3, $3, $4, $5, $6, 'ACTIVE')
     ON CONFLICT (user_id) DO UPDATE SET
       batch = EXCLUDED.batch,
       current_semester = EXCLUDED.current_semester,
       section_code = EXCLUDED.section_code,
       enrollment_no = COALESCE(student_profiles.enrollment_no, EXCLUDED.enrollment_no),
       prn_number = COALESCE(student_profiles.prn_number, EXCLUDED.prn_number),
       updated_at = NOW()`,
    [tenantId, userId, enrollmentNo, batch, semester, section],
  );

  report.rollback.student_snapshots.push({ user_id: userId, before });
  if (
    before.batch !== batch ||
    before.current_semester !== semester ||
    before.section_code !== section
  ) {
    report.students.updated.push({ email, name: row.student_name, semester, section, batch });
  } else {
    report.students.unchanged.push({ email, name: row.student_name });
  }
}

async function upsertSubject(client, programId, row, report) {
  const code = normalizeCode(row.course_code);
  const subType = normalizeSubType(row.subject_type, row.course_name, code);
  const credits = Number(row.credits) || 0;
  const shortname = row.course_name.split(/\s+/).slice(0, 3).join(' ').slice(0, 50) || code;

  const existing = await client.query(
    `SELECT subject_id FROM academic_subjects WHERE subject_code = $1 LIMIT 1`,
    [code],
  );

  const result = await client.query(
    `INSERT INTO academic_subjects
       (subject_code, subject_name, subject_shortname, program_id, credits, subject_type, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (subject_code) DO UPDATE SET
       subject_name = EXCLUDED.subject_name,
       subject_shortname = COALESCE(EXCLUDED.subject_shortname, academic_subjects.subject_shortname),
       credits = EXCLUDED.credits,
       subject_type = EXCLUDED.subject_type,
       is_active = true,
       updated_at = NOW()
     RETURNING subject_id`,
    [code, row.course_name, shortname, programId, credits, subType],
  );

  if (existing.rows[0]) report.courses.updated.push({ course_code: code, course_name: row.course_name });
  else report.courses.imported.push({ course_code: code, course_name: row.course_name });

  return result.rows[0].subject_id;
}

async function ensureCourse(client, tenantId, row) {
  const code = normalizeCode(row.course_code);
  const credits = Number(row.credits) || 0;
  const subType = normalizeSubType(row.subject_type, row.course_name, code);
  const courseType = subType === 'LAB' ? 'LAB' : 'CORE';
  const result = await client.query(
    `INSERT INTO academic_courses (tenant_id, course_code, course_name, credits, is_elective, course_type)
     VALUES ($1, $2, $3, $4, false, $5)
     ON CONFLICT (tenant_id, course_code) DO UPDATE SET
       course_name = EXCLUDED.course_name,
       credits = EXCLUDED.credits,
       course_type = EXCLUDED.course_type
     RETURNING course_id`,
    [tenantId, code, row.course_name, credits, courseType],
  );
  return result.rows[0].course_id;
}

async function upsertAllocation(client, tenantId, runId, academicYear, subjectId, courseId, facultyUserId, row, report) {
  const result = await client.query(
    `INSERT INTO academic_course_allocations
       (tenant_id, subject_id, program_name, semester, faculty_user_id, academic_year, course_id, status, import_run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
     ON CONFLICT (tenant_id, subject_id, program_name, semester, academic_year)
     DO UPDATE SET
       faculty_user_id = EXCLUDED.faculty_user_id,
       course_id = EXCLUDED.course_id,
       import_run_id = EXCLUDED.import_run_id,
       status = 'ACTIVE',
       updated_at = NOW()
     RETURNING allocation_id`,
    [
      tenantId,
      subjectId,
      row.programme,
      row.semester,
      facultyUserId,
      academicYear,
      courseId,
      runId,
    ],
  );

  report.rollback.allocation_ids.push(result.rows[0].allocation_id);
  report.faculty.imported.push({
    faculty_email: row.faculty_email,
    faculty_name: row.faculty_name,
    course_code: normalizeCode(row.course_code),
    semester: row.semester,
  });
}

async function runImport(slug, options) {
  const cfg = loadConfig(slug);
  const base = deptDir(slug);
  const studentsPath = path.join(base, cfg.sources.students_csv);
  const workloadPath = path.join(base, cfg.sources.faculty_workload_csv);

  const studentRows = readCsv(studentsPath);
  const workloadRows = readCsv(workloadPath);

  const studentValidation = validateStudents(studentRows);
  const workloadValidation = validateWorkload(workloadRows);

  const validation = {
    students: studentValidation,
    workload: workloadValidation,
    critical_errors: [
      ...studentValidation.errors,
      ...workloadValidation.errors,
    ],
    duplicates: [
      ...studentValidation.duplicates,
      ...workloadValidation.duplicates,
    ],
    warnings: [
      ...studentValidation.warnings,
      ...workloadValidation.warnings,
    ],
  };

  const report = {
    department: slug,
    config: cfg,
    students: {
      imported: [],
      updated: [],
      unchanged: [],
      skipped: [],
      created: [],
      role_corrected: [],
    },
    faculty: { imported: [], skipped: [], created: [], updated: [] },
    courses: { imported: [], updated: [] },
    rollback: { allocation_ids: [], student_snapshots: [], student_user_ids: [], faculty_user_ids: [] },
    validation,
    run_id: null,
  };

  if (options.dryRun) {
    return report;
  }

  if (options.strict && validation.critical_errors.length) {
    throw new Error(`Validation failed with ${validation.critical_errors.length} critical error(s)`);
  }
  if (!studentRows.length && !workloadRows.length) {
    throw new Error('No import rows found. Run parse:department first.');
  }

  const client = new Client(dbConfig());
  await client.connect();

  try {
    await client.query('BEGIN');
    const tenantId = await resolveTenant(client, cfg.tenant_subdomain);
    const department = await resolveDepartment(client, cfg.department_name);
    const programId = await ensureProgram(client, cfg, department.dept_id);

    const runInsert = await client.query(
      `INSERT INTO department_import_runs
         (tenant_id, department_slug, department_name, academic_year, session_label, status, source_files, validation)
       VALUES ($1, $2, $3, $4, $5, 'RUNNING', $6::jsonb, $7::jsonb)
       RETURNING run_id`,
      [
        tenantId,
        slug,
        cfg.department_name,
        cfg.academic_year,
        cfg.session_label,
        JSON.stringify({
          students_csv: studentsPath,
          workload_csv: workloadPath,
        }),
        JSON.stringify(validation),
      ],
    );
    const runId = runInsert.rows[0].run_id;
    report.run_id = runId;

    for (const row of studentRows) {
      await upsertStudent(client, tenantId, department.dept_id, row, cfg, report);
    }

    const facultyCache = new Map();

    for (const row of workloadRows) {
      const email = row.faculty_email?.toLowerCase();
      if (!email) {
        report.faculty.skipped.push({
          faculty_email: row.faculty_email,
          course_code: row.course_code,
          reason: 'Faculty email missing in source row',
        });
        continue;
      }

      let faculty = facultyCache.get(email);
      if (!faculty) {
        faculty = await ensureFacultyUser(
          client,
          tenantId,
          department.dept_id,
          row,
          cfg,
          report,
        );
        if (faculty) facultyCache.set(email, faculty);
      }

      if (!faculty) {
        report.faculty.skipped.push({
          faculty_email: row.faculty_email,
          course_code: row.course_code,
          reason: 'Faculty user not found in tenant',
        });
        if (options.strict) {
          throw new Error(`Missing faculty: ${row.faculty_email}`);
        }
        continue;
      }

      const mergedRow = {
        ...row,
        course_name: row.course_name || row.course_code,
        programme: row.programme || cfg.program_allocation_name,
      };
      const subjectId = await upsertSubject(client, programId, mergedRow, report);
      const courseId = await ensureCourse(client, tenantId, mergedRow);
      await upsertAllocation(
        client,
        tenantId,
        runId,
        cfg.academic_year,
        subjectId,
        courseId,
        faculty.user_id,
        mergedRow,
        report,
      );
    }

    const summary = {
      students_created: report.students.created.length,
      students_updated: report.students.updated.length,
      students_unchanged: report.students.unchanged.length,
      students_skipped: report.students.skipped.length,
      faculty_assignments: report.faculty.imported.length,
      faculty_created: report.faculty.created.length,
      faculty_updated: report.faculty.updated.length,
      faculty_skipped: report.faculty.skipped.length,
      courses_imported: report.courses.imported.length,
      courses_updated: report.courses.updated.length,
      validation_errors: validation.critical_errors.length,
      duplicate_records: validation.duplicates.length,
      rollback: report.rollback,
    };

    await client.query(
      `UPDATE department_import_runs
       SET status = 'COMPLETED', summary = $2::jsonb, completed_at = NOW()
       WHERE run_id = $1`,
      [runId, JSON.stringify(summary)],
    );

    await client.query('COMMIT');
    report.summary = summary;
    return report;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

function writeCredentialsExport(slug, report) {
  const rows = [
    ...report.students.created.map((s) => ({
      role: 'Student',
      name: s.name,
      email: s.email,
      enrollment_no: s.enrollment_no,
      password: s.default_password,
    })),
    ...report.faculty.created.map((f) => ({
      role: 'Faculty',
      name: f.name,
      email: f.email,
      enrollment_no: '',
      password: f.default_password,
    })),
  ];
  if (!rows.length) return;

  const outPath = path.join(deptDir(slug), 'import-credentials.csv');
  const header = 'role,name,email,enrollment_no,password\n';
  const body = rows
    .map((r) =>
      [r.role, r.name, r.email, r.enrollment_no, r.password]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
  fs.writeFileSync(outPath, header + body + '\n', 'utf8');
  console.log(`Wrote credentials -> ${outPath}`);
}

function writeReports(report) {
  const slug = report.department.toUpperCase();
  writeMarkdown(
    path.join(DOCS_ROOT, 'VALIDATION_REPORT.md'),
    renderReport('Validation Report', [
      ['Summary', `- Critical errors: ${report.validation.critical_errors.length}\n- Duplicates: ${report.validation.duplicates.length}\n- Warnings: ${report.validation.warnings.length}`],
      ['Critical Errors', tableFromRows(report.validation.critical_errors, ['line', 'type', 'message']) || '_None._'],
      ['Duplicate Records', tableFromRows(report.validation.duplicates, ['line', 'message']) || '_None._'],
      ['Warnings', tableFromRows(report.validation.warnings, ['line', 'type', 'message']) || '_None._'],
    ]),
  );

  writeMarkdown(
    path.join(DOCS_ROOT, 'STUDENT_IMPORT_REPORT.md'),
    renderReport('Student Import Report', [
      ['Created (new login accounts)', tableFromRows(report.students.created, ['email', 'name', 'enrollment_no', 'semester', 'default_password']) || '_None._'],
      ['Role corrected (Faculty → Student)', tableFromRows(report.students.role_corrected, ['email', 'from', 'to']) || '_None._'],
      ['Updated', tableFromRows(report.students.updated, ['email', 'name', 'semester', 'section', 'batch']) || '_None._'],
      ['Unchanged', tableFromRows(report.students.unchanged, ['email', 'name']) || '_None._'],
      ['Skipped', tableFromRows(report.students.skipped, ['email', 'name', 'reason']) || '_None._'],
    ]),
  );

  writeMarkdown(
    path.join(DOCS_ROOT, 'FACULTY_IMPORT_REPORT.md'),
    renderReport('Faculty Import Report', [
      ['Created (new login accounts)', tableFromRows(report.faculty.created, ['email', 'name', 'default_password']) || '_None._'],
      ['Updated', tableFromRows(report.faculty.updated, ['email', 'name']) || '_None._'],
      ['Assignments Imported', tableFromRows(report.faculty.imported, ['faculty_email', 'faculty_name', 'course_code', 'semester']) || '_None._'],
      ['Skipped', tableFromRows(report.faculty.skipped, ['faculty_email', 'course_code', 'reason']) || '_None._'],
    ]),
  );

  writeMarkdown(
    path.join(DOCS_ROOT, 'COURSE_IMPORT_REPORT.md'),
    renderReport('Course Import Report', [
      ['Imported', tableFromRows(report.courses.imported, ['course_code', 'course_name']) || '_None._'],
      ['Updated', tableFromRows(report.courses.updated, ['course_code', 'course_name']) || '_None._'],
    ]),
  );

  writeMarkdown(
    path.join(DOCS_ROOT, 'MIGRATION_SUMMARY.md'),
    renderReport('Migration Summary', [
      ['Run', `- Department: ${report.config.department_name}\n- Slug: ${report.department}\n- Run ID: ${report.run_id || '(dry-run)'}\n- Academic year: ${report.config.academic_year}`],
      ['Counts', report.summary
        ? Object.entries(report.summary)
            .filter(([k]) => k !== 'rollback')
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')
        : '_Dry run — no database changes._'],
    ]),
  );
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.slug) {
    console.error('Usage: node import-department.js <department-slug> [--dry-run] [--strict]');
    process.exit(1);
  }

  if (!options.skipParse) {
    const { spawnSync } = require('child_process');
    const parseScript = path.join(__dirname, 'parse-department-sources.py');
    const parsed = spawnSync('python3', [parseScript, options.slug], { stdio: 'inherit' });
    if (parsed.status !== 0) {
      process.exit(parsed.status || 1);
    }
  }

  const report = await runImport(options.slug, options);
  writeReports(report);
  writeCredentialsExport(options.slug, report);

  console.log('\nDepartment import complete.');
  if (report.summary) {
    console.log(JSON.stringify(report.summary, null, 2));
  } else {
    console.log('Dry run — validation only.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runImport, validateStudents, validateWorkload, writeReports };
