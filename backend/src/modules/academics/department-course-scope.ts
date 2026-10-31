/** SQL fragments use internal aliases/parameter references only, never user input. */
export function allocationDepartmentScope(allocation: string, faculty: string, departments: string) {
  const programMatch = `p.deleted_at IS NULL AND (
    upper(regexp_replace(p.program_name, '[^a-zA-Z0-9]', '', 'g')) = upper(regexp_replace(COALESCE(${allocation}.program_name, ''), '[^a-zA-Z0-9]', '', 'g'))
    OR upper(regexp_replace(p.program_code, '[^a-zA-Z0-9]', '', 'g')) = upper(regexp_replace(COALESCE(${allocation}.program_name, ''), '[^a-zA-Z0-9]', '', 'g'))
  )`;
  // An explicit programme department takes precedence over the teacher's home department.
  // Recognised legacy programmes may not have a department assigned yet. Preserve
  // their faculty scope (and blank legacy allocations), but do not grant scope to
  // arbitrary named programmes such as QA sandboxes just because the teacher works here.
  return `(EXISTS (SELECT 1 FROM iam_programs p WHERE ${programMatch} AND p.dept_id = ANY(${departments}))
    OR (NOT EXISTS (SELECT 1 FROM iam_programs p WHERE ${programMatch} AND p.dept_id IS NOT NULL)
      AND (NULLIF(BTRIM(${allocation}.program_name), '') IS NULL
        OR EXISTS (SELECT 1 FROM iam_programs p WHERE ${programMatch}))
      AND ${faculty}.dept_id = ANY(${departments})))`;
}

export function enrolledDepartmentScope(course: string, tenant: string, departments: string) {
  return `EXISTS (
    SELECT 1 FROM student_course_enrollments e
    JOIN users student ON student.user_id = e.student_user_id AND student.tenant_id = e.tenant_id
    JOIN roles student_role ON student_role.role_id = student.role_id AND student_role.role_name = 'Student'
    WHERE e.tenant_id = ${tenant} AND e.course_id = ${course}
      AND e.status = 'ENROLLED' AND student.deleted_at IS NULL
      AND student.dept_id = ANY(${departments})
  )`;
}
