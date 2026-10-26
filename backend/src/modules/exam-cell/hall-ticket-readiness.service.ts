import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';
import { normalizeProgram } from '../academics/allocation-semester.util';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import { FinanceService } from '../finance/finance.service';
import { assertExamCellAction } from './exam-cell-rbac.util';
import { requireHallTicketTenant } from './hall-ticket-policy';

type Registration = {
  student_user_id: string;
  window_id: string;
  session_id: string;
  semester: number;
  status: string;
  reviewed_at: Date | null;
  reviewed_by: string | null;
};

/** Diagnostic only. This report is never an issuance token or approval. */
@Injectable()
export class HallTicketReadinessService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly enrollment: StudentEnrollmentSyncService,
    private readonly attendance: AttendanceEligibilityService,
    private readonly finance: FinanceService,
  ) {}

  async inspect(
    tenant: string,
    sessionId: string,
    registrationId: string,
    role?: string,
  ) {
    tenant = requireHallTicketTenant(tenant);
    assertExamCellAction(role, 'view_dashboard');
    if (!isUUID(sessionId) || !isUUID(registrationId))
      throw new BadRequestException(
        'Explicit session and registration IDs are required',
      );
    const result = await this.db.transaction(async (manager) => {
      const reasons: string[] = [];
      const [session] = await manager.query<
        Array<{
          session_id: string;
          status: string;
          semester: number;
          program_label: string;
          academic_year: string;
        }>
      >(
        'SELECT * FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR SHARE',
        [tenant, sessionId],
      );
      if (!session)
        throw new NotFoundException('Examination session not found');
      const [reference] = await manager.query<Registration[]>(
        'SELECT * FROM exam_semester_registrations WHERE tenant_id=$1 AND session_id=$2 AND registration_id=$3',
        [tenant, sessionId, registrationId],
      );
      if (!reference)
        throw new NotFoundException('Registration not found for this session');
      if (!isUUID(reference.student_user_id) || !isUUID(reference.window_id))
        throw new BadRequestException(
          'Registration identity and window could not be verified',
        );
      const [window] = await manager.query<
        Array<{ session_id: string; semester: number; program_label: string }>
      >(
        'SELECT * FROM exam_form_windows WHERE tenant_id=$1 AND window_id=$2 FOR SHARE',
        [tenant, reference.window_id],
      );
      const [registration] = await manager.query<Registration[]>(
        'SELECT * FROM exam_semester_registrations WHERE tenant_id=$1 AND session_id=$2 AND registration_id=$3 FOR SHARE',
        [tenant, sessionId, registrationId],
      );
      if (
        !registration ||
        registration.window_id !== reference.window_id ||
        registration.student_user_id !== reference.student_user_id
      )
        throw new NotFoundException('Registration changed; reload the queue');
      if (
        !window ||
        window.session_id !== sessionId ||
        window.semester !== session.semester ||
        registration.semester !== session.semester ||
        !window.program_label?.trim() ||
        !session.program_label?.trim() ||
        !session.academic_year?.trim() ||
        !Number.isSafeInteger(session.semester) ||
        session.semester < 1 ||
        normalizeProgram(window.program_label) !==
          normalizeProgram(session.program_label)
      )
        throw new BadRequestException(
          'Registration, form window and session scope do not match',
        );
      if (!['OPEN', 'ACTIVE'].includes(session.status))
        reasons.push('Session must be OPEN or ACTIVE for new issuance');
      if (
        registration.status !== 'APPROVED' ||
        !registration.reviewed_at ||
        !registration.reviewed_by
      )
        reasons.push('Registration requires an authorized approval');
      const approvals = await manager.query<
        Array<{
          stage: string;
          eligibility_status: string;
          finance_status: string;
          exam_office_status: string;
          coe_status: string;
          approved_by: string | null;
          approved_at: Date | null;
          block_reasons: unknown;
        }>
      >(
        'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 AND session_id=$2 AND registration_id=$3 AND student_user_id=$4 AND semester=$5 FOR SHARE',
        [
          tenant,
          sessionId,
          registrationId,
          registration.student_user_id,
          session.semester,
        ],
      );
      const approval = approvals.length === 1 ? approvals[0] : undefined;
      if (
        !approval ||
        approval.stage !== 'APPROVED' ||
        !approval.approved_at ||
        !approval.approved_by ||
        [
          approval.eligibility_status,
          approval.finance_status,
          approval.exam_office_status,
          approval.coe_status,
        ].some((s) => s !== 'APPROVED') ||
        !Array.isArray(approval.block_reasons) ||
        approval.block_reasons.length
      )
        reasons.push(
          'A unique, linked final Hall Ticket approval with every stage completed is required',
        );
      const roster = await this.enrollment.listExamRegistrationRoster(
        tenant,
        {
          academic_year: session.academic_year,
          semester: session.semester,
          program_label: session.program_label,
        },
        manager,
        registration.student_user_id,
      );
      if (
        !Array.isArray(roster) ||
        roster.some(
          (entry) =>
            !entry ||
            !Array.isArray(entry.enrollments) ||
            !Array.isArray(entry.unresolved_reasons) ||
            entry.unresolved_reasons.some(
              (reason) => typeof reason !== 'string',
            ),
        )
      )
        throw new ServiceUnavailableException(
          'The official enrollment roster is unavailable or malformed',
        );
      const student =
        roster.length === 1 &&
        roster[0].student_user_id === registration.student_user_id
          ? roster[0]
          : undefined;
      const verifiedSubjects =
        student?.enrollments.every(
          (entry) =>
            entry &&
            typeof entry.course_id === 'string' &&
            isUUID(entry.course_id) &&
            Number.isSafeInteger(entry.subject_id) &&
            Number(entry.subject_id) > 0 &&
            typeof entry.course_code === 'string' &&
            !!entry.course_code.trim(),
        ) &&
        new Set(student.enrollments.map((entry) => entry.course_id)).size ===
          student.enrollments.length &&
        new Set(student.enrollments.map((entry) => entry.subject_id)).size ===
          student.enrollments.length;
      if (
        !student ||
        student.unresolved_reasons.length ||
        !student.enrollments.length ||
        !verifiedSubjects
      )
        reasons.push(
          'Current enrollment and subject allocations are missing or ambiguous; review the official registration',
        );
      let attendancePercent: number | null = null;
      if (
        student?.enrollments.length &&
        !student.unresolved_reasons.length &&
        verifiedSubjects
      ) {
        const courseIds = [
          ...new Set(student.enrollments.map((e) => e.course_id)),
        ];
        const attendance = await this.attendance.evaluate(
          tenant,
          registration.student_user_id,
          {
            strict: true,
            context: 'ADMIT_CARD',
            semester: session.semester,
            courseIds,
            manager,
            audit: false,
          },
        );
        if (
          !attendance ||
          typeof attendance.eligible !== 'boolean' ||
          !Number.isFinite(attendance.attendance_percent) ||
          attendance.attendance_percent < 0 ||
          attendance.attendance_percent > 100
        )
          throw new ServiceUnavailableException(
            'Strict attendance clearance is unavailable',
          );
        attendancePercent = attendance.attendance_percent;
        if (!attendance.eligible)
          reasons.push(
            attendance.reason || 'Strict attendance clearance is not verified',
          );
        const schedules = await manager.query<
          Array<{
            exam_schedule_id: string;
            subject_id: number;
            exam_date: string;
            start_time: string;
            end_time: string;
            venue: string;
            status: string;
          }>
        >(
          `SELECT exam_schedule_id, subject_id, exam_date, start_time, end_time, venue, status FROM exam_schedules
           WHERE tenant_id=$1 AND session_id=$2 AND subject_id=ANY($3::int[]) AND deleted_at IS NULL ORDER BY exam_schedule_id FOR SHARE`,
          [tenant, sessionId, student.enrollments.map((e) => e.subject_id)],
        );
        const seats = await manager.query<
          Array<{ exam_schedule_id: string; room: string; seat_number: string }>
        >(
          `SELECT exam_schedule_id, room, seat_number FROM exam_seating_allocations WHERE tenant_id=$1 AND student_user_id=$2
           AND exam_schedule_id=ANY($3::uuid[]) ORDER BY exam_schedule_id FOR SHARE`,
          [
            tenant,
            registration.student_user_id,
            schedules.map((s) => s.exam_schedule_id),
          ],
        );
        for (const enrollment of student.enrollments) {
          const matches = schedules.filter(
            (s) => s.subject_id === enrollment.subject_id,
          );
          if (matches.length !== 1) {
            reasons.push(
              `A unique session timetable slot is required for ${enrollment.course_code}`,
            );
            continue;
          }
          const schedule = matches[0];
          if (
            schedule.status !== 'SCHEDULED' ||
            !schedule.exam_date ||
            !schedule.start_time ||
            !schedule.end_time ||
            schedule.start_time >= schedule.end_time ||
            !schedule.venue?.trim()
          )
            reasons.push(
              `The timetable slot for ${enrollment.course_code} is incomplete or not scheduled`,
            );
          const ownSeat = seats.filter(
            (s) => s.exam_schedule_id === schedule.exam_schedule_id,
          );
          if (
            ownSeat.length !== 1 ||
            !ownSeat[0].room?.trim() ||
            !ownSeat[0].seat_number?.trim()
          )
            reasons.push(
              `The student's own seating allocation is required for ${enrollment.course_code}`,
            );
        }
      }
      return {
        student_user_id: registration.student_user_id,
        semester: session.semester,
        attendance_percent: attendancePercent,
        block_reasons: reasons,
      };
    });
    // Finance owns its repository/connection. Do not hold a pool connection
    // while calling it. This diagnostic is not a locked issuance authorization.
    const dues = await this.finance.getPendingDues(
      result.student_user_id,
      tenant,
    );
    if (!Array.isArray(dues))
      throw new ServiceUnavailableException('Finance clearance is unavailable');
    if (dues.length) result.block_reasons.push('Pending fee dues');
    return {
      session_id: sessionId,
      registration_id: registrationId,
      ...result,
      fee_clear: dues.length === 0,
      ready_to_issue: false,
      diagnostic_only: true,
      unresolved_requirements: [
        'Eligibility and Exam Office approver roles are not confirmed',
        'The required internal assessment components and their finalized state are not mapped to this examination session',
        'Mandatory document, active UFM restriction and post-issuance dues policies require authoritative definitions',
        'Timetable approval/release rules and the durable issuance writer are not yet implemented',
      ],
    };
  }
}
