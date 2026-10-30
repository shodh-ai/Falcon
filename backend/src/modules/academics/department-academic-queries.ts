import { allocationDepartmentScope, enrolledDepartmentScope } from './department-course-scope';
// Read-only academic projections shared by HOD and authorized Principal oversight.
export type DepartmentAcademicQuery = (
  sql: string,
  args: unknown[],
) => Promise<any[]>;
export function academicYearAt(date = new Date()) {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${start + 1}`;
}

export async function listDepartmentFacultyWorkload(
  query: DepartmentAcademicQuery,
  tenantId: string,
  deptIds: number[],
  academicYear: string,
) {
  if (!deptIds.length) return [];

  const rows = await query(
    `WITH assigned AS (
         SELECT a.tenant_id, a.faculty_user_id,
                COALESCE(SUM(COALESCE(c.credits, 0)), 0)::int AS assigned_load_credits,
                COUNT(DISTINCT a.course_id)::int AS assigned_course_count,
                COUNT(DISTINCT a.course_id) FILTER (WHERE NOT EXISTS (
                  SELECT 1
                  FROM academic_timetables t
                  WHERE t.tenant_id = a.tenant_id
                    AND t.course_id = a.course_id
                    AND t.faculty_user_id = a.faculty_user_id
                    AND t.deleted_at IS NULL
                ))::int AS unscheduled_course_count
         FROM academic_course_allocations a
         LEFT JOIN academic_courses c ON c.course_id = a.course_id
         WHERE a.tenant_id = $1 AND a.academic_year = $3 AND a.status = 'ACTIVE'
         GROUP BY a.tenant_id, a.faculty_user_id
       ), faculty_courses AS (
         -- Dedupe allocation rows before joining the faculty's own slots.
         -- A co-teaching allocation alone does not assign every other
         -- teacher's contact hours to this faculty member.
         SELECT DISTINCT tenant_id, faculty_user_id, course_id
         FROM academic_course_allocations
         WHERE tenant_id = $1 AND academic_year = $3 AND status = 'ACTIVE'
           AND faculty_user_id IS NOT NULL AND course_id IS NOT NULL
       ), scheduled AS (
         SELECT fc.faculty_user_id, fc.tenant_id,
                SUM(EXTRACT(EPOCH FROM (t.end_time::time - t.start_time::time)) / 60)::numeric AS scheduled_minutes,
                COUNT(DISTINCT t.course_id)::int AS scheduled_course_count
         FROM faculty_courses fc
         INNER JOIN academic_timetables t
          ON t.tenant_id = fc.tenant_id
          AND t.course_id = fc.course_id
          AND t.faculty_user_id = fc.faculty_user_id
          AND t.deleted_at IS NULL
         GROUP BY fc.tenant_id, fc.faculty_user_id
       ), held_sessions AS (
         SELECT e.tenant_id, faculty_id,
           COUNT(*)::int AS pending_sessions,
           SUM(EXTRACT(EPOCH FROM ((e.entry->>'end')::time-(e.entry->>'start')::time))/60)::int AS pending_minutes
         FROM academic_timetable_source_entries e
         JOIN academic_timetable_publications p ON p.publication_id=e.publication_id AND p.state='ACTIVE' AND p.activated_on<=CURRENT_DATE
         CROSS JOIN LATERAL unnest(e.faculty_user_ids) faculty_id
         WHERE e.tenant_id=$1 AND e.state='HELD' AND p.manifest->>'academic_year'=$3
         GROUP BY e.tenant_id,faculty_id
       )
       SELECT u.user_id, u.name, u.official_email AS email, u.dept_id,
              d.dept_name,
              hod.name AS hod_name,
              hod.official_email AS hod_email,
              fld.status AS load_declaration_status,
              fld.reason AS load_declaration_reason,
              fld.revision AS load_declaration_revision,
              fld.academic_year AS load_declaration_academic_year,
              COALESCE(assigned.assigned_load_credits, 0)::int AS assigned_load_credits,
              -- Keep this alias for existing consumers; it is credits, not hours.
              COALESCE(assigned.assigned_load_credits, 0)::int AS assigned_load_hours,
              COALESCE(scheduled.scheduled_minutes, 0)::numeric AS scheduled_minutes,
              COALESCE(held_sessions.pending_sessions,0)::int AS pending_sessions,
              COALESCE(held_sessions.pending_minutes,0)::int AS pending_minutes,
              (COALESCE(scheduled.scheduled_minutes, 0) / 60)::numeric AS scheduled_hours,
              (COALESCE(scheduled.scheduled_minutes, 0) / 60)::numeric AS hours_per_week,
              COALESCE(assigned.assigned_course_count, 0)::int AS course_count,
              COALESCE(assigned.unscheduled_course_count, 0)::int AS unscheduled_course_count
       FROM users u
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN users hod ON hod.user_id = d.hod_user_id
       LEFT JOIN scheduled ON scheduled.faculty_user_id = u.user_id
        AND scheduled.tenant_id = u.tenant_id
       LEFT JOIN assigned ON assigned.faculty_user_id = u.user_id
        AND assigned.tenant_id = u.tenant_id
       LEFT JOIN held_sessions ON held_sessions.faculty_id=u.user_id AND held_sessions.tenant_id=u.tenant_id
       LEFT JOIN academic_faculty_load_declarations fld
         ON fld.tenant_id = u.tenant_id
        AND fld.faculty_user_id = u.user_id
        AND fld.academic_year = $3
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.dept_id = ANY($2::int[])
         AND u.is_active=true AND u.deleted_at IS NULL
         AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'Principal')
       ORDER BY d.dept_name ASC, assigned_load_hours DESC, u.name ASC`,
    [tenantId, deptIds, academicYear],
  );

  return rows.map((row: any) => ({
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    dept_id: row.dept_id,
    dept_name: row.dept_name,
    hod_name: row.hod_name,
    hod_email: row.hod_email,
    hours_per_week: Number(row.hours_per_week ?? 0),
    assigned_load_credits: Number(
      row.assigned_load_credits ?? row.assigned_load_hours ?? 0,
    ),
    assigned_load_hours: Number(row.assigned_load_hours ?? 0),
    scheduled_hours: Number(row.scheduled_hours ?? 0),
    scheduled_minutes: Number(row.scheduled_minutes ?? 0),
    pending_sessions: Number(row.pending_sessions ?? 0),
    pending_minutes: Number(row.pending_minutes ?? 0),
    course_count: Number(row.course_count ?? 0),
    unscheduled_course_count: Number(row.unscheduled_course_count ?? 0),
    load_declaration_status: row.load_declaration_status ?? null,
    load_declaration_reason: row.load_declaration_reason ?? null,
    load_declaration_revision: Number(row.load_declaration_revision ?? 0),
    load_declaration_academic_year:
      row.load_declaration_academic_year ?? academicYear,
    workload_status:
      row.load_declaration_status === 'NO_TEACHING_LOAD'
        ? 'NO_TEACHING_LOAD'
        : Number(row.pending_sessions ?? 0) > 0
          ? 'AWAITING_CONFIRMATION'
          : Number(row.unscheduled_course_count ?? 0) > 0
            ? 'SCHEDULE_MISSING'
            : Number(row.course_count ?? 0) === 0 &&
                Number(row.hours_per_week ?? 0) === 0
              ? 'NO_ACTIVE_ALLOCATION'
              : Number(row.hours_per_week ?? 0) > 16
                ? 'OVERLOADED'
                : Number(row.hours_per_week ?? 0) < 6
                  ? 'UNDERUTILIZED'
                  : 'BALANCED',
  }));
}

export async function listDepartmentTimetable(
  query: DepartmentAcademicQuery,
  tenantId: string,
  deptIds: number[],
  academicYear: string,
) {
  if (!deptIds.length) return [];

  return query(
    `SELECT t.timetable_id, t.day_of_week, t.start_time, t.end_time, t.room, t.section,
              c.course_id, c.course_code, c.course_name,
              a.program_name, a.semester,
              u.user_id AS faculty_user_id, u.name AS faculty_name,
              u.dept_id, d.dept_name
       FROM academic_timetables t
       INNER JOIN academic_courses c ON c.course_id = t.course_id AND c.tenant_id=t.tenant_id
       LEFT JOIN LATERAL (
         SELECT a.program_name, a.semester
         FROM academic_course_allocations a
         WHERE a.tenant_id = t.tenant_id
           AND a.course_id = t.course_id
           AND a.faculty_user_id = t.faculty_user_id
           AND a.academic_year = $3
           AND a.status = 'ACTIVE'
         ORDER BY a.updated_at DESC NULLS LAST, a.allocation_id DESC
         LIMIT 1
       ) a ON TRUE
       INNER JOIN users u ON u.user_id = t.faculty_user_id AND u.tenant_id=t.tenant_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE t.tenant_id = $1
         AND (EXISTS (
           SELECT 1 FROM academic_course_allocations scoped_allocation
           WHERE scoped_allocation.tenant_id = t.tenant_id
             AND scoped_allocation.course_id = t.course_id
             AND scoped_allocation.faculty_user_id = t.faculty_user_id
             AND scoped_allocation.academic_year = $3
             AND scoped_allocation.status = 'ACTIVE'
             AND ${allocationDepartmentScope('scoped_allocation', 'u', '$2::int[]')}
         ) OR ${enrolledDepartmentScope('t.course_id', 't.tenant_id', '$2::int[]')})
         AND EXISTS (
           SELECT 1
           FROM academic_course_allocations current_allocation
           WHERE current_allocation.tenant_id = t.tenant_id
             AND current_allocation.course_id = t.course_id
             AND current_allocation.faculty_user_id = t.faculty_user_id
             AND current_allocation.academic_year = $3
             AND current_allocation.status = 'ACTIVE'
         )
         AND t.deleted_at IS NULL
       ORDER BY d.dept_name ASC, t.day_of_week ASC, t.start_time ASC, c.course_code ASC`,
    [tenantId, deptIds, academicYear],
  );
}
