import type { EntityManager } from 'typeorm';
import { allocationMatchesStudentSlot } from './allocation-semester.util';

type ExtraClassRow = {
  adjustment_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  room: string | null;
  faculty_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  student_semester: number;
  student_section: string | null;
  student_program: string;
  allocation_semester: string | null;
  allocation_program: string | null;
  academic_year: string;
};

/** Whole-course extras use the same active programme/section allocation as their faculty roster. */
export async function getStudentExtraClassSessions(
  db: Pick<EntityManager, 'query'>,
  tenantId: string,
  studentUserId: string,
  courseIds: string[],
  from: string,
  to: string,
) {
  if (!courseIds.length) return [];
  const rows = await db.query<ExtraClassRow[]>(
    `SELECT a.adjustment_id,a.course_id,c.course_code,c.course_name,c.credits,
            a.proposed_room AS room,u.name AS faculty_name,
            (a.new_date AT TIME ZONE 'Asia/Kolkata')::date::text AS session_date,
            to_char(a.new_date AT TIME ZONE 'Asia/Kolkata','HH24:MI') AS start_time,
            to_char((a.new_date AT TIME ZONE 'Asia/Kolkata') + interval '1 hour','HH24:MI') AS end_time,
            e.semester AS student_semester,e.section_code AS student_section,
            COALESCE(NULLIF(BTRIM(sp.program_name),''),NULLIF(BTRIM(sp.batch),'')) AS student_program,
            ca.semester AS allocation_semester,ca.program_name AS allocation_program,ca.academic_year
     FROM class_adjustments a
     JOIN academic_courses c ON c.tenant_id=a.tenant_id AND c.course_id=a.course_id
     JOIN users u ON u.tenant_id=a.tenant_id AND u.user_id=a.faculty_user_id
     JOIN student_course_enrollments e ON e.tenant_id=a.tenant_id AND e.course_id=a.course_id
       AND e.student_user_id=$2::uuid AND e.status='ENROLLED'
     JOIN student_profiles sp ON sp.tenant_id=e.tenant_id AND sp.user_id=e.student_user_id
       AND sp.deleted_at IS NULL AND sp.status='ACTIVE'
     JOIN academic_course_allocations ca ON ca.tenant_id=a.tenant_id AND ca.course_id=a.course_id
       AND ca.faculty_user_id=a.faculty_user_id AND ca.status='ACTIVE'
     WHERE a.tenant_id=$1::uuid AND a.course_id=ANY($3::uuid[])
       AND a.adjustment_type='EXTRA_CLASS' AND a.status IN ('APPROVED','NOTIFIED')
       AND (a.new_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $4::date AND $5::date
     ORDER BY a.new_date,a.adjustment_id`,
    [tenantId, studentUserId, courseIds, from, to],
  );
  const sessions = new Map<
    string,
    {
      timetable_id: string;
      class_adjustment_id: string;
      is_extra_class: boolean;
      course_id: string;
      course_code: string;
      course_name: string;
      credits: number;
      room: string | null;
      faculty_name: string;
      section: null;
      day_of_week: number;
      session_date: string;
      start_time: string;
      end_time: string;
      is_virtual: boolean;
      live_join_url: null;
    }
  >();
  for (const row of rows) {
    const date = new Date(`${row.session_date}T00:00:00Z`);
    const year = date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
    if (
      row.academic_year !== `${year}-${year + 1}` ||
      !allocationMatchesStudentSlot(
        row.allocation_semester,
        row.allocation_program,
        Number(row.student_semester),
        row.student_section,
        row.student_program,
      )
    )
      continue;
    sessions.set(row.adjustment_id, {
      timetable_id: `extra:${row.adjustment_id}`,
      class_adjustment_id: row.adjustment_id,
      is_extra_class: true,
      course_id: row.course_id,
      course_code: row.course_code,
      course_name: row.course_name,
      credits: row.credits,
      room: row.room,
      faculty_name: row.faculty_name,
      section: null,
      day_of_week: date.getUTCDay() || 7,
      session_date: row.session_date,
      start_time: row.start_time,
      end_time: row.end_time,
      is_virtual: false,
      live_join_url: null,
    });
  }
  return [...sessions.values()];
}
