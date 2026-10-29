import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  assertExamCellAction,
  normalizeExamCellRole,
} from './exam-cell-rbac.util';

export const HALL_TICKET_APPROVAL_STAGES = [
  'ELIGIBILITY',
  'FINANCE',
  'EXAM_OFFICE',
  'COE',
] as const;

export type HallTicketApprovalStage =
  (typeof HALL_TICKET_APPROVAL_STAGES)[number];

/** Explicitly approved stage assignments; no implicit administrator override. */
export const HALL_TICKET_STAGE_ROLES: Readonly<
  Record<
    HallTicketApprovalStage,
    'ExamAdmin' | 'Accountant' | 'DeputyCOE' | 'ExamCell'
  >
> = {
  ELIGIBILITY: 'ExamAdmin',
  FINANCE: 'Accountant',
  EXAM_OFFICE: 'DeputyCOE',
  COE: 'ExamCell',
};

export function assertHallTicketStageRole(
  tenantId: string,
  stage: HallTicketApprovalStage,
  actorRole?: string,
): void {
  requireHallTicketTenant(tenantId);
  const role = normalizeExamCellRole(actorRole);
  if (!role || role === 'examoperator')
    throw new ForbiddenException('Your role cannot approve hall tickets');
  if (!HALL_TICKET_APPROVAL_STAGES.includes(stage))
    throw new BadRequestException('A current approval stage is required');
  const requiredRole = HALL_TICKET_STAGE_ROLES[stage];
  // No CampusAdmin/SuperAdmin alias or generation permission is stage authority.
  if (role !== normalizeExamCellRole(requiredRole))
    throw new ForbiddenException(
      `Your role cannot approve the ${stage} hall-ticket stage`,
    );
}

/**
 * Approved role mappings do not establish missing authoritative clearance data.
 * Keep legacy writes blocked until the session-linked writer, finalized internal
 * assessment source, examination-specific clearance sources and authorized
 * post-issuance hold workflow are implemented and verified.
 */
export function hallTicketWorkflowAvailability() {
  return {
    status: 'BLOCKED' as const,
    // Retained for existing API clients; the message identifies technical blockers.
    code: 'HALL_TICKET_POLICY_UNCONFIRMED',
    approval_roles_confirmed: true,
    can_sync: false,
    can_approve: false,
    can_issue: false,
    message:
      'Hall-ticket approver roles are confirmed. Approval and issuance remain blocked until authoritative finalized assessment, examination-specific clearances, authorized holds and the session-linked issuance workflow are implemented and verified. Clearance alone is not approval or issuance.',
  };
}

export function requireHallTicketTenant(tenantId: string): string {
  if (typeof tenantId !== 'string' || !isUUID(tenantId.trim()))
    throw new ForbiddenException('Valid authenticated tenant context required');
  return tenantId.trim();
}

export function assertHallTicketApprovalPolicy(
  tenantId: string,
  role?: string,
): never {
  requireHallTicketTenant(tenantId);
  // role-permissions.matrix.ts explicitly grants ExamOperator no approvals.
  // Generation permission must not be promoted into stage approval authority.
  if (normalizeExamCellRole(role) === 'examoperator')
    throw new ForbiddenException('ExamOperator cannot approve hall tickets');
  // Finance is a confirmed stage role, not an Exam Cell workspace role. This
  // admission reaches only the closed policy gate; it grants no stage action.
  if (normalizeExamCellRole(role) !== 'accountant')
    assertExamCellAction(role, 'generate_admit_cards');
  return assertHallTicketIssuancePolicy(tenantId);
}

export function assertHallTicketIssuancePolicy(tenantId: string): never {
  requireHallTicketTenant(tenantId);
  throw new ServiceUnavailableException({
    statusCode: 503,
    ...hallTicketWorkflowAvailability(),
  });
}
