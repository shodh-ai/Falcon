/** SQL fragments use internal aliases/parameter references only, never user input. */
export function allocationDepartmentScope(allocation: string, faculty: string, departments: string) {
  const programMatch = `p.deleted_at IS NULL AND (
    upper(regexp_replace(p.program_name, '[^a-zA-Z0-9]', '', 'g')) = upper(regexp_replace(COALESCE(${allocation}.program_name, ''), '[^a-zA-Z0-9]', '', 'g'))
    OR upper(regexp_replace(p.program_code, '[^a-zA-Z0-9]', '', 'g')) = upper(regexp_replace(COALESCE(${allocation}.program_name, ''), '[^a-zA-Z0-9]', '', 'g'))
  )`;
  // An explicit programme mapping takes precedence over a visiting teacher's home department.
  // Legacy allocations without a mapped programme retain their faculty-department scope.
  return `(EXISTS (SELECT 1 FROM iam_programs p WHERE ${programMatch} AND p.dept_id = ANY(${departments}))
    OR (NOT EXISTS (SELECT 1 FROM iam_programs p WHERE ${programMatch})
      AND ${faculty}.dept_id = ANY(${departments})))`;
}

export function enrolledDepartmentScope(course: string, tenant: string, departments: string) {
  return `EXISTS (
    SELECT 1 FROM student_course_enrollments e
    JOIN users student ON student.user_id = e.student_user_id AND student.tenant_id = e.tenant_id
    WHERE e.tenant_id = ${tenant} AND e.course_id = ${course}
      AND e.status = 'ENROLLED' AND student.deleted_at IS NULL
      AND student.dept_id = ANY(${departments})
  )`;
}
