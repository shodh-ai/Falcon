import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ExamCellDevService {
  private readonly log = new Logger(ExamCellDevService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async queryOrSkip<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    try {
      return await this.db.query(sql, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation .* does not exist|column .* does not exist/i.test(msg))
        return [];
      throw err;
    }
  }

  /** Idempotent dev bootstrap — reuses existing students, faculty, courses. */
  async bootstrap(tenantId: string, actorUserId: string) {
    const summary: Record<string, number | string> = { tenant_id: tenantId };

    const students = await this.db.query<
      Array<{ user_id: string; name: string }>
    >(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Student'
       ORDER BY u.name LIMIT 50`,
      [tenantId],
    );
    summary.students_found = students.length;

    const faculty = await this.db.query<
      Array<{ user_id: string; name: string }>
    >(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('Faculty','HOD')
       ORDER BY u.name LIMIT 20`,
      [tenantId],
    );
    summary.faculty_found = faculty.length;

    const courses = await this.db.query<
      Array<{ course_id: string; course_code: string }>
    >(
      `SELECT course_id, course_code FROM academic_courses
       WHERE tenant_id = $1 ORDER BY course_code LIMIT 20`,
      [tenantId],
    );
    summary.courses_found = courses.length;

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    if (students.length && courses.length) {
      const courseId = courses[0].course_id;
      const [schedMid] = await this.queryOrSkip(
        `INSERT INTO exam_schedules
           (tenant_id, exam_type, exam_date, start_time, end_time, venue, max_marks, status, batch_label)
         SELECT $1, 'MID_TERM', $2::date, '09:00', '12:00', 'Block A — Hall 101', 50, 'SCHEDULED', 'B.Tech Sem 4 MID TERM'
         WHERE NOT EXISTS (
           SELECT 1 FROM exam_schedules WHERE tenant_id = $1 AND batch_label = 'B.Tech Sem 4 MID TERM' AND exam_type = 'MID_TERM'
         )
         RETURNING exam_schedule_id`,
        [tenantId, tomorrow],
      );
      const [schedEnd] = await this.queryOrSkip(
        `INSERT INTO exam_schedules
           (tenant_id, exam_type, exam_date, start_time, end_time, venue, max_marks, status, batch_label)
         SELECT $1, 'END_TERM', $3::date, '14:00', '17:00', 'Block A — Hall 102', 100, 'SCHEDULED', 'B.Tech Sem 4 END TERM'
         WHERE NOT EXISTS (
           SELECT 1 FROM exam_schedules WHERE tenant_id = $1 AND batch_label = 'B.Tech Sem 4 END TERM' AND exam_type = 'END_TERM'
         )
         RETURNING exam_schedule_id`,
        [tenantId, today, tomorrow],
      );
      summary.schedules_created = (schedMid ? 1 : 0) + (schedEnd ? 1 : 0);

      const examScheduleId =
        schedEnd?.exam_schedule_id ??
        schedMid?.exam_schedule_id ??
        (
          await this.queryOrSkip<{ exam_schedule_id: string }>(
            `SELECT exam_schedule_id FROM exam_schedules WHERE tenant_id = $1 ORDER BY exam_date LIMIT 1`,
            [tenantId],
          )
        )[0]?.exam_schedule_id;

      if (examScheduleId) {
        let seats = 0;
        for (let i = 0; i < Math.min(students.length, 12); i++) {
          const seat = String(i + 1).padStart(2, '0');
          const room = i < 6 ? 'A101' : 'A102';
          const [row] = await this.queryOrSkip(
            `INSERT INTO exam_seating_allocations
               (tenant_id, exam_schedule_id, room, student_user_id, seat_number, branch_code)
             SELECT $1, $2, $3, $4, $5, 'CSE'
             WHERE NOT EXISTS (
               SELECT 1 FROM exam_seating_allocations
               WHERE exam_schedule_id = $2 AND student_user_id = $4
             )
             RETURNING allocation_id`,
            [tenantId, examScheduleId, room, students[i].user_id, seat],
          );
          if (row) seats += 1;
        }
        summary.seating_allocations = seats;
      }

      const [session] = await this.queryOrSkip(
        `INSERT INTO exam_sessions
           (tenant_id, session_name, academic_year, semester, program_label, exam_type, status)
         SELECT $1, 'End Semester Examination 2025-26', '2025-26', 4, 'B.Tech Computer Science', 'END_TERM', 'ACTIVE'
         WHERE NOT EXISTS (
           SELECT 1 FROM exam_sessions WHERE tenant_id = $1 AND session_name = 'End Semester Examination 2025-26'
         )
         RETURNING session_id`,
        [tenantId],
      );
      if (session) summary.exam_sessions_created = 1;

      for (const s of students.slice(0, 8)) {
        await this.queryOrSkip(
          `INSERT INTO hall_ticket_approvals
             (tenant_id, student_user_id, semester, batch_label, stage, eligibility_status, finance_status, exam_office_status, coe_status)
           SELECT $1, $2, 4, 'B.Tech Sem 4 END TERM', 'COE', 'APPROVED', 'APPROVED', 'APPROVED', 'PENDING'
           ON CONFLICT (tenant_id, student_user_id, semester, batch_label) DO NOTHING`,
          [tenantId, s.user_id],
        );
      }
      summary.hall_ticket_approvals = Math.min(students.length, 8);

      if (faculty.length && examScheduleId) {
        await this.queryOrSkip(
          `INSERT INTO exam_invigilation_duties
             (tenant_id, exam_schedule_id, room, faculty_user_id, role, published)
           SELECT $1, $2, 'A101', $3, 'INVIGILATOR', true
           WHERE NOT EXISTS (
             SELECT 1 FROM exam_invigilation_duties WHERE exam_schedule_id = $2 AND room = 'A101'
           )`,
          [tenantId, examScheduleId, faculty[0].user_id],
        );
      }
    }

    await this.queryOrSkip(
      `INSERT INTO exam_audit_logs (tenant_id, actor_user_id, action, resource_type, new_value)
       VALUES ($1, $2, 'DEV_BOOTSTRAP', 'exam_cell', $3::jsonb)`,
      [tenantId, actorUserId, JSON.stringify(summary)],
    );

    this.log.log(
      `Exam cell dev bootstrap for tenant ${tenantId}: ${JSON.stringify(summary)}`,
    );
    return {
      ok: true,
      message: 'Development examination data bootstrapped',
      summary,
    };
  }

  async status(tenantId: string) {
    const counts = await Promise.all([
      this.queryOrSkip<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_schedules WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.queryOrSkip<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_sessions WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.queryOrSkip<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM exam_seating_allocations WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.queryOrSkip<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM hall_ticket_approvals WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);
    return {
      schedules: counts[0][0]?.c ?? 0,
      sessions: counts[1][0]?.c ?? 0,
      seating: counts[2][0]?.c ?? 0,
      hall_ticket_approvals: counts[3][0]?.c ?? 0,
      needs_bootstrap: (counts[0][0]?.c ?? 0) === 0,
    };
  }
}
