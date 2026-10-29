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
import { ExamCellAuditService } from './exam-cell-audit.service';
import {
  assertHallTicketIssuancePolicy,
  assertHallTicketStageRole,
  HallTicketApprovalStage,
  requireHallTicketTenant,
} from './hall-ticket-policy';
import {
  HallTicketApprovalState,
  planHallTicketApprovalTransition,
  validateHallTicketApprovalCommand,
} from './hall-ticket-transition';

type Approval = HallTicketApprovalState & {
  approval_id: string;
  registration_id: string;
  session_id: string;
  student_user_id: string;
  semester: number;
};
type Registration = {
  registration_id: string;
  window_id: string;
  student_user_id: string;
  session_id: string;
  semester: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

/** Rejection does not certify clearance. Positive decisions still fail closed. */
@Injectable()
export class HallTicketDecisionService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: ExamCellAuditService,
  ) {}

  async decide(
    tenant: string,
    actor: string,
    role: string | undefined,
    ids: string[],
    input: unknown,
    expectedSession?: string,
  ) {
    tenant = requireHallTicketTenant(tenant);
    const command = validateHallTicketApprovalCommand(input);
    if (
      !isUUID(actor) ||
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== 'string' || !isUUID(id)) ||
      new Set(ids.map((id) => id.toLowerCase())).size !== ids.length ||
      (expectedSession !== undefined && !isUUID(expectedSession))
    )
      throw new BadRequestException(
        'Valid actor, unique approvals and session required',
      );

    return this.db.transaction(async (manager) => {
      // Discovery supplies lock keys only, never authorization. Recheck after locks.
      const discovered = await manager.query<Approval[]>(
        'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 AND approval_id=ANY($2::uuid[]) ORDER BY approval_id',
        [tenant, ids],
      );
      if (discovered.length !== ids.length)
        throw new NotFoundException('Hall-ticket approval not found');
      const sessionId = discovered[0].session_id;
      if (
        !sessionId ||
        discovered.some(
          (row) => !row.registration_id || row.session_id !== sessionId,
        ) ||
        (expectedSession !== undefined && expectedSession !== sessionId)
      )
        throw new ConflictException(
          'Approvals must link to the exact selected session and registration',
        );
      const [session] = await manager.query<
        Array<{ semester: number; status: string }>
      >(
        'SELECT semester,status FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
        [tenant, sessionId],
      );
      if (!session)
        throw new NotFoundException('Examination session not found');
      if (!['OPEN', 'ACTIVE'].includes(session.status))
        throw new ConflictException(
          'Hall-ticket decisions require an OPEN or ACTIVE session',
        );
      // Match issuance and download lock order: session -> windows -> registrations -> approvals.
      const windows = await manager.query<
        Array<{ window_id: string; semester: number }>
      >(
        'SELECT window_id,semester FROM exam_form_windows WHERE tenant_id=$1 AND session_id=$2 ORDER BY window_id FOR SHARE',
        [tenant, sessionId],
      );
      const registrations = await manager.query<Registration[]>(
        'SELECT * FROM exam_semester_registrations WHERE tenant_id=$1 AND session_id=$2 AND registration_id=ANY($3::uuid[]) ORDER BY registration_id FOR UPDATE',
        [tenant, sessionId, discovered.map((row) => row.registration_id)],
      );
      const approvals = await manager.query<Approval[]>(
        'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 AND approval_id=ANY($2::uuid[]) ORDER BY approval_id FOR UPDATE',
        [tenant, ids],
      );
      if (approvals.length !== ids.length)
        throw new ConflictException(
          'Approval records changed; reload the queue',
        );
      const actors = await manager.query<unknown[]>(
        'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
        [tenant, actor],
      );
      if (actors.length !== 1)
        throw new ForbiddenException(
          'Active authenticated tenant actor required',
        );

      const plans = approvals.map((row) => {
        const original = discovered.find(
          (item) => item.approval_id === row.approval_id,
        );
        const registration = registrations.find(
          (item) => item.registration_id === row.registration_id,
        );
        const window = windows.find(
          (item) => item.window_id === registration?.window_id,
        );
        if (
          row.session_id !== sessionId ||
          row.registration_id !== original?.registration_id ||
          row.student_user_id !== original?.student_user_id ||
          !registration ||
          !window ||
          registration.student_user_id !== row.student_user_id ||
          registration.session_id !== sessionId ||
          registration.status !== 'APPROVED' ||
          !registration.reviewed_at ||
          !registration.reviewed_by ||
          [row.semester, registration.semester, window.semester].some(
            (value) => value !== session.semester,
          )
        )
          throw new ConflictException(
            'An approved, reviewed registration for the exact student and session is required',
          );
        assertHallTicketStageRole(
          tenant,
          row.stage as HallTicketApprovalStage,
          role,
        );
        return { row, plan: planHallTicketApprovalTransition(row, command) };
      });
      // No positive decision can certify unavailable official clearance evidence.
      // Keep this guard until each stage has an authoritative prerequisite adapter.
      if (command.action === 'APPROVE') assertHallTicketIssuancePolicy(tenant);

      for (const { row, plan } of plans) {
        // status_column is selected exclusively by the server's transition planner.
        const changed = await manager.query<unknown[]>(
          `WITH changed AS (UPDATE hall_ticket_approvals SET stage=$3, ${plan.status_column}=$4,
           block_reasons=$5::jsonb, updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND approval_id=$2 AND stage=$6 RETURNING approval_id) SELECT approval_id FROM changed`,
          [
            tenant,
            row.approval_id,
            plan.stage,
            plan.status,
            JSON.stringify([
              ...(row.block_reasons as string[]),
              command.reason,
            ]),
            row.stage,
          ],
        );
        if (changed.length !== 1)
          throw new ConflictException('Approval changed; reload the queue');
        await this.audit.log(
          tenant,
          actor,
          {
            action: 'HALL_TICKET_STAGE_REJECTED',
            resource_type: 'hall_ticket_approval',
            resource_id: row.approval_id,
            old_value: { stage: row.stage },
            new_value: {
              stage: plan.stage,
              rejected_stage: row.stage,
              reason: command.reason,
              session_id: sessionId,
            },
          },
          manager,
        );
      }
      return { updated: plans.length, action: command.action };
    });
  }
}
