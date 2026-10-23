/** Shared recorded attendance projection. Parameters are SQL placeholders, never user input. */
export function facultyAttendanceStatsCte(tenantParam: string, courseParam?: string): string {
  return `attendance_stats AS (
    SELECT cal.tenant_id, cal.course_id,
           entry.value->>'student_id' AS student_user_id,
           COUNT(*)::int AS attendance_record_count,
           COUNT(*) FILTER (
             WHERE entry.value->>'status' IN ('PRESENT', 'LATE', 'EXCUSED')
           )::int AS attendance_present_count,
           ROUND(
             100.0 * COUNT(*) FILTER (
               WHERE entry.value->>'status' IN ('PRESENT', 'LATE', 'EXCUSED')
             ) / NULLIF(COUNT(*), 0),
             2
           ) AS attendance_percent
    FROM course_attendance_logs cal
    CROSS JOIN LATERAL jsonb_array_elements(cal.attendance_data) entry(value)
    WHERE cal.tenant_id = ${tenantParam}
      ${courseParam ? `AND cal.course_id = ${courseParam}` : ''}
      AND cal.deleted_at IS NULL
      AND entry.value->>'status' IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')
    GROUP BY cal.tenant_id, cal.course_id, entry.value->>'student_id'
  )`;
}
