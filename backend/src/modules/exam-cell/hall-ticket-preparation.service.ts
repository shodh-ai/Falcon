import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';
import { normalizeProgram } from '../academics/allocation-semester.util';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { assertExamCellAction, canExamCellAction } from './exam-cell-rbac.util';
import {
  hallTicketWorkflowAvailability,
  requireHallTicketTenant,
} from './hall-ticket-policy';

type Session = {
  session_id: string;
  tenant_id: string;
  status: string;
  semester: number;
  academic_year: string;
  program_label: string;
};
type Registration = {
  registration_id: string;
  student_user_id: string;
  window_id: string;
  session_id: string;
  semester: number;
  reviewed_at: Date | null;
  reviewed_by: string | null;
};

/** Prepares the existing approval queue. It never approves or issues a ticket. */
@Injectable()
export class HallTicketPreparationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly enrollment: StudentEnrollmentSyncService,
    private readonly audit: ExamCellAuditService,
  ) {}

  private id(value: string) {
    if (typeof value !== 'string' || !isUUID(value))
      throw new BadRequestException(
        'A valid examination session ID is required',
      );
  }

  async availability(tenant: string, sessionId: string, role?: string) {
    tenant = requireHallTicketTenant(tenant);
    this.id(sessionId);
    const [session] = await this.db.query<Session[]>(
      'SELECT * FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2',
      [tenant, sessionId],
    );
    if (!session) throw new NotFoundException('Examination session not found');
    return {
      ...hallTicketWorkflowAvailability(),
      can_sync:
        canExamCellAction(role, 'manage_sessions') &&
        ['OPEN', 'ACTIVE'].includes(session.status),
      message:
        'The approval queue can be prepared from approved registrations for this session. Preparation does not approve eligibility or issue a ticket. Approver roles are confirmed; positive approvals and issuance await authoritative prerequisite integrations. Authorized stage officers may reject linked pending records with a reason.',
    };
  }

  async prepare(
    tenant: string,
    sessionId: string,
    actor: string,
    role?: string,
  ) {
    tenant = requireHallTicketTenant(tenant);
    assertExamCellAction(role, 'manage_sessions');
    this.id(sessionId);
    if (typeof actor !== 'string' || !isUUID(actor))
      throw new ForbiddenException('Authenticated actor required');
    return this.db.transaction(async (manager) => {
      // Serialize preparation and follow registration/download order:
      // session -> windows (sorted) -> registrations -> approvals -> source rows.
      const [session] = await manager.query<Session[]>(
        'SELECT * FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
        [tenant, sessionId],
      );
      if (!session)
        throw new NotFoundException('Examination session not found');
      if (!['OPEN', 'ACTIVE'].includes(session.status))
        throw new BadRequestException(
          'Approval preparation requires an OPEN or ACTIVE session',
        );
      if (
        !session.academic_year?.trim() ||
        !session.program_label?.trim() ||
        !Number.isSafeInteger(session.semester) ||
        session.semester < 1
      )
        throw new ConflictException(
          'The session must define its academic year, programme and semester',
        );
      const actors = await manager.query<unknown[]>(
        'SELECT user_id FROM users WHERE user_id=$1 AND tenant_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
        [actor, tenant],
      );
      if (actors.length !== 1)
        throw new ForbiddenException(
          'Active authenticated tenant actor required',
        );
      const windows = await manager.query<
        Array<{ window_id: string; semester: number; program_label: string }>
      >(
        'SELECT window_id, semester, program_label FROM exam_form_windows WHERE tenant_id=$1 AND session_id=$2 ORDER BY window_id FOR SHARE',
        [tenant, sessionId],
      );
      const registrations = await manager.query<Registration[]>(
        `SELECT registration_id, student_user_id, window_id, session_id, semester, reviewed_by, reviewed_at
         FROM exam_semester_registrations WHERE tenant_id=$1 AND session_id=$2 AND status='APPROVED'
         ORDER BY registration_id FOR SHARE`,
        [tenant, sessionId],
      );
      if (
        new Set(registrations.map((r) => r.student_user_id)).size !==
        registrations.length
      )
        throw new ConflictException(
          'Multiple approved registrations exist for a student in this session; resolve the source registrations before preparing approvals',
        );
      let created = 0;
      for (const registration of registrations) {
        const window = windows.find(
          (w) => w.window_id === registration.window_id,
        );
        if (
          !window ||
          window.semester !== session.semester ||
          registration.semester !== session.semester ||
          !window.program_label?.trim() ||
          normalizeProgram(window.program_label) !==
            normalizeProgram(session.program_label) ||
          !registration.reviewed_at ||
          !registration.reviewed_by
        )
          throw new ConflictException(
            'An approved registration has inconsistent session, window or review records',
          );
        const existing = await manager.query<
          Array<{
            approval_id: string;
            session_id: string;
            student_user_id: string;
            semester: number;
          }>
        >(
          'SELECT approval_id, session_id, student_user_id, semester FROM hall_ticket_approvals WHERE tenant_id=$1 AND registration_id=$2 FOR UPDATE',
          [tenant, registration.registration_id],
        );
        if (
          existing.length > 1 ||
          existing.some(
            (a) =>
              a.session_id !== sessionId ||
              a.student_user_id !== registration.student_user_id ||
              a.semester !== session.semester,
          )
        )
          throw new ConflictException(
            'Linked approval records are inconsistent; manual review is required',
          );
        // Preserve ALL previous decisions, timestamps, reasons and legacy rows.
        if (existing.length) continue;
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
          roster.length !== 1 ||
          roster[0].student_user_id !== registration.student_user_id ||
          roster[0].unresolved_reasons.length ||
          !roster[0].enrollments.length ||
          roster[0].enrollments.some(
            (e) =>
              !Number.isSafeInteger(e.subject_id) || Number(e.subject_id) < 1,
          )
        )
          throw new ConflictException(
            'An approved registration no longer has a verified enrollment and subject roster; review the registration',
          );
        const [approval] = await manager.query<Array<{ approval_id: string }>>(
          `INSERT INTO hall_ticket_approvals
           (tenant_id, student_user_id, semester, batch_label, registration_id, session_id, stage,
            eligibility_status, finance_status, exam_office_status, coe_status, block_reasons)
           VALUES ($1,$2,$3,NULL,$4,$5,'ELIGIBILITY','PENDING','PENDING','PENDING','PENDING','[]'::jsonb)
           ON CONFLICT (tenant_id, registration_id) WHERE registration_id IS NOT NULL DO NOTHING
           RETURNING approval_id`,
          [
            tenant,
            registration.student_user_id,
            session.semester,
            registration.registration_id,
            sessionId,
          ],
        );
        if (approval) {
          await this.audit.log(
            tenant,
            actor,
            {
              action: 'HALL_TICKET_APPROVAL_PREPARED',
              resource_type: 'hall_ticket_approval',
              resource_id: approval.approval_id,
              new_value: {
                session_id: sessionId,
                registration_id: registration.registration_id,
                stage: 'ELIGIBILITY',
              },
            },
            manager,
          );
          created++;
        }
      }
      return {
        session_id: sessionId,
        synced: created,
        total: registrations.length,
        unchanged: registrations.length - created,
      };
    });
  }
}
