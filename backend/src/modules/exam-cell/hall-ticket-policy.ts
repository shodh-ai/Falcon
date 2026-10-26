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

/** Confirmed stage assignments only. Null is a closed policy gate, not a role. */
export const HALL_TICKET_STAGE_ROLES: Readonly<
  Record<HallTicketApprovalStage, 'Accountant' | 'ExamCell' | null>
> = {
  ELIGIBILITY: null,
  FINANCE: 'Accountant',
  EXAM_OFFICE: null,
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
  if (requiredRole === null)
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'HALL_TICKET_STAGE_POLICY_UNCONFIRMED',
      message: `The authorized role for ${stage} approval is not confirmed`,
      stage,
    });
  // No CampusAdmin/SuperAdmin alias or generation permission is stage authority.
  if (role !== normalizeExamCellRole(requiredRole))
    throw new ForbiddenException(
      `Your role cannot approve the ${stage} hall-ticket stage`,
    );
}

/**
 * Explicit safety interlock, not a configurable permission or approval policy.
 * Confirmed by the requester: Finance=Accountant, final COE=ExamCell;
 * ExamOperator never approves. One ticket/student/session; issue only OPEN or
 * ACTIVE sessions; required internal marks must be finalized. Revoked approval
 * or rejected registration blocks download. These are not permission grants.
 * Eligibility/Exam Office role mappings, conditional clearance applicability
 * and post-issuance dues policy remain unresolved. The writer is incomplete.
 * Do not remove this guard merely to enable the legacy batch-label writers:
 * replace those writers with the verified session-linked workflow first.
 */
export function hallTicketWorkflowAvailability() {
  return {
    status: 'BLOCKED' as const,
    code: 'HALL_TICKET_POLICY_UNCONFIRMED',
    can_sync: false,
    can_approve: false,
    can_issue: false,
    message:
      'Hall-ticket approval and issuance are unavailable until Eligibility/Exam Office roles, conditional clearance rules and post-issuance dues policy are verified and the session-linked workflow is implemented. Existing records remain read-only; clearance alone is not approval or issuance.',
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
