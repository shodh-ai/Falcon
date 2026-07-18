const ROMAN_SEMESTER = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
};

function parseAllocationSemester(semester) {
  if (!semester?.trim()) return { semesterNum: null, sectionCode: null };
  const parts = semester.trim().split('-');
  const roman = (parts[0]?.trim() ?? '').toUpperCase();
  const sectionCode = parts[1]?.trim().toUpperCase() || null;
  return { semesterNum: ROMAN_SEMESTER[roman] ?? null, sectionCode };
}

function normalizeProgram(value) {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

function programsMatch(allocationProgram, studentProgram) {
  const alloc = normalizeProgram(allocationProgram);
  const prog = normalizeProgram(studentProgram);
  if (!prog || !alloc) return true;
  if (prog === alloc) return true;
  if (alloc.includes('ME') && (prog.includes('MECHANICAL') || prog.includes('MECH'))) return true;
  if (alloc.includes('AGRI') && prog.includes('AGRI')) return true;
  if (alloc.includes('PHARM') && prog.includes('PHARM')) return true;
  if (alloc.includes('CSE') && (prog.includes('COMPUTER') || prog.includes('CSE'))) return true;
  return false;
}

function allocationMatchesStudentSlot(
  allocationSemester,
  allocationProgram,
  studentSemester,
  studentSection,
  studentProgram,
) {
  const { semesterNum, sectionCode } = parseAllocationSemester(allocationSemester);
  if (semesterNum != null && semesterNum !== studentSemester) return false;
  if (!programsMatch(allocationProgram, studentProgram)) return false;
  const studentSectionNorm = studentSection?.trim().toUpperCase() ?? null;
  if (sectionCode && studentSectionNorm && sectionCode !== studentSectionNorm) return false;
  return true;
}

async function resolveStudentSlot(client, tenantId, studentUserId) {
  const { rows } = await client.query(
    `SELECT sp.batch, sp.current_semester, sp.section_code
     FROM student_profiles sp
     WHERE sp.user_id = $1 AND sp.tenant_id = $2
     LIMIT 1`,
    [studentUserId, tenantId],
  );
  if (!rows[0]?.current_semester) return null;
  return {
    studentUserId,
    tenantId,
    program: rows[0].batch ?? '',
    semester: Number(rows[0].current_semester),
    sectionCode: rows[0].section_code?.trim().toUpperCase() ?? null,
  };
}

async function syncStudentSlot(client, slot, academicYear) {
  const { rows: allocations } = await client.query(
    `SELECT course_id, program_name, semester
     FROM academic_course_allocations
     WHERE tenant_id = $1
       AND academic_year = $2
       AND status = 'ACTIVE'
       AND course_id IS NOT NULL`,
    [slot.tenantId, academicYear],
  );

  const courseIds = [
    ...new Set(
      allocations
        .filter((row) =>
          allocationMatchesStudentSlot(
            row.semester,
            row.program_name,
            slot.semester,
            slot.sectionCode,
            slot.program,
          ),
        )
        .map((row) => row.course_id)
        .filter(Boolean),
    ),
  ];

  let added = 0;
  let kept = 0;
  for (const courseId of courseIds) {
    const upserted = await client.query(
      `INSERT INTO student_course_enrollments
         (tenant_id, student_user_id, course_id, semester, section_code, status)
       VALUES ($1, $2, $3, $4, $5, 'ENROLLED')
       ON CONFLICT (tenant_id, student_user_id, course_id)
       DO UPDATE SET
         semester = EXCLUDED.semester,
         section_code = COALESCE(EXCLUDED.section_code, student_course_enrollments.section_code),
         status = CASE
           WHEN student_course_enrollments.status = 'COMPLETED' THEN student_course_enrollments.status
           ELSE 'ENROLLED'
         END
       RETURNING (xmax = 0) AS inserted`,
      [slot.tenantId, slot.studentUserId, courseId, slot.semester, slot.sectionCode],
    );
    if (upserted.rows[0]?.inserted) added += 1;
    else kept += 1;
  }

  let removed = 0;
  if (courseIds.length > 0) {
    const deleted = await client.query(
      `DELETE FROM student_course_enrollments
       WHERE tenant_id = $1
         AND student_user_id = $2
         AND semester = $3
         AND status = 'ENROLLED'
         AND course_id <> ALL($4::uuid[])
       RETURNING enrollment_id`,
      [slot.tenantId, slot.studentUserId, slot.semester, courseIds],
    );
    removed = deleted.rows.length;
  }

  return { added, kept, removed, courses: courseIds.length };
}

async function syncStudentsByEmails(client, tenantId, emails, academicYear) {
  const results = [];
  for (const email of emails) {
    const user = await client.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND lower(official_email) = lower($2) LIMIT 1`,
      [tenantId, email],
    );
    if (!user.rows[0]) continue;
    const slot = await resolveStudentSlot(client, tenantId, user.rows[0].user_id);
    if (!slot) continue;
    const stats = await syncStudentSlot(client, slot, academicYear);
    results.push({ email, ...stats });
  }
  return results;
}

async function syncDepartmentStudents(client, tenantId, deptId, academicYear) {
  const { rows } = await client.query(
    `SELECT u.user_id, u.official_email
     FROM users u
     INNER JOIN roles r ON r.role_id = u.role_id
     INNER JOIN student_profiles sp ON sp.user_id = u.user_id
     WHERE u.tenant_id = $1
       AND u.dept_id = $2
       AND r.role_name = 'Student'
       AND u.is_active = true`,
    [tenantId, deptId],
  );

  const results = [];
  for (const row of rows) {
    const slot = await resolveStudentSlot(client, tenantId, row.user_id);
    if (!slot) continue;
    const stats = await syncStudentSlot(client, slot, academicYear);
    results.push({ email: row.official_email, ...stats });
  }
  return results;
}

module.exports = {
  syncDepartmentStudents,
  syncStudentsByEmails,
  syncStudentSlot,
  allocationMatchesStudentSlot,
};
