export type AttendanceQuery = (sql: string, args: unknown[]) => Promise<any[]>;

export async function attendanceReopening(query: AttendanceQuery, tenant: string, faculty: string,
  course: string, session: string | undefined, date: string, lock = false) {
  if (!session) return null;
  const [grant] = await query(`SELECT request_id,expires_at FROM academic_attendance_reopen_requests
    WHERE tenant_id=$1 AND faculty_user_id=$2 AND course_id=$3 AND session_key=$4
      AND class_date=$5::date AND status='APPROVED' AND expires_at>clock_timestamp()
    ORDER BY expires_at DESC LIMIT 1 ${lock ? 'FOR SHARE' : ''}`,
  [tenant, faculty, course, session, date]);
  return grant ?? null;
}

// An office is authoritative only while enabled and assigned in this tenant.
export const departmentHodPredicate = (staff = 'u', actor = '$2') => `EXISTS (
  SELECT 1 FROM departments d LEFT JOIN department_leadership leadership
    ON leadership.tenant_id=${staff}.tenant_id AND leadership.dept_id=d.dept_id
  WHERE d.dept_id=${staff}.dept_id AND EXISTS(SELECT 1 FROM users active_actor WHERE active_actor.tenant_id=${staff}.tenant_id AND active_actor.user_id=${actor} AND active_actor.is_active=true AND active_actor.deleted_at IS NULL) AND (
    (leadership.dept_id IS NULL AND d.hod_user_id=${actor}) OR
    (leadership.structure IN ('HOD_ONLY','PRINCIPAL_HOD') AND EXISTS (
      SELECT 1 FROM department_offices office JOIN department_office_appointments appointment
        ON appointment.office_id=office.office_id AND appointment.valid_to IS NULL AND appointment.valid_from<=now()
      WHERE office.tenant_id=${staff}.tenant_id AND office.dept_id=d.dept_id
        AND office.kind='HOD' AND appointment.user_id=${actor}))))`;
