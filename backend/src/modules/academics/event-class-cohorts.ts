import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceQuery } from './attendance-reopening';

// Event approval and cohort approval are independent. Revoking either stops access.
export const approvedEventSql = (e = 'e') => `${e}.status='LIVE'
  AND ${e}.advisor_approval='APPROVED' AND ${e}.hod_approval='APPROVED' AND ${e}.dean_approval='APPROVED'
  AND ${e}.estate_approval IN ('APPROVED','NOT_REQUIRED')
  AND (COALESCE(${e}.funds_needed,0)<=0 OR ${e}.finance_approval='APPROVED')`;

export async function eventExemptions(
  query: AttendanceQuery,
  tenant: string,
  from: string,
  to = from,
) {
  return query(
    `SELECT x.cohort_id,x.timetable_id::text,x.course_id,x.faculty_user_id,
    x.class_date::text,x.coordinator_user_id,x.student_ids,x.attendance_data,e.title AS event_title,x.event_id
    FROM academic_event_class_cohorts x JOIN campus_events e ON e.event_id=x.event_id AND e.tenant_id=x.tenant_id
    WHERE x.tenant_id=$1 AND x.class_date BETWEEN $2::date AND $3::date
      AND x.status='APPROVED' AND ${approvedEventSql()}`,
    [tenant, from, to],
  );
}

export async function assertNoEventExemption(
  query: AttendanceQuery,
  tenant: string,
  session: string | undefined,
  date: string,
  course?: string,
) {
  if (!session && !course) return;
  const rows = await eventExemptions(query, tenant, date);
  if (rows.some((x) => session ? x.timetable_id === session : x.course_id === course))
    throw new ForbiddenException(
      'This class is exempted for an approved event. The event coordinator marks attendance in Mark Event Attendance.',
    );
}

export function validateEventAttendance(
  studentIds: string[],
  data: Array<{ student_id: string; status: string }>,
) {
  if (
    !Array.isArray(data) ||
    data.length !== studentIds.length ||
    data.some(x=>!x || typeof x.student_id!=='string' || typeof x.status!=='string') ||
    new Set(data.map((x) => x.student_id)).size !== data.length ||
    data.some(
      (x) =>
        !studentIds.includes(x.student_id) ||
        !['PRESENT', 'ABSENT'].includes(x.status),
    )
  )
    throw new BadRequestException(
      'Mark Present or Absent for every student in the approved event cohort, exactly once',
    );
}
