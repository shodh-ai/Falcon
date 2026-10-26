import { BadRequestException, ConflictException } from '@nestjs/common';
import { HALL_TICKET_APPROVAL_STAGES } from './hall-ticket-policy';

export type HallTicketApprovalCommand = {
  action: 'APPROVE' | 'REJECT';
  reason?: string;
};

export type HallTicketApprovalState = {
  stage: string;
  eligibility_status: string;
  finance_status: string;
  exam_office_status: string;
  coe_status: string;
  approved_by: string | null;
  approved_at: Date | string | null;
  block_reasons: unknown;
};

const STATUS_COLUMNS = [
  'eligibility_status',
  'finance_status',
  'exam_office_status',
  'coe_status',
] as const;

/** Runtime validation also protects direct service callers outside DTO pipes. */
export function validateHallTicketApprovalCommand(
  input: unknown,
): HallTicketApprovalCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('A hall-ticket approval action is required');
  const command = input as Record<string, unknown>;
  if (Object.keys(command).some((key) => !['action', 'reason'].includes(key)))
    throw new BadRequestException(
      'Approval stages and actor identities are controlled by the server',
    );
  if (command.action !== 'APPROVE' && command.action !== 'REJECT')
    throw new BadRequestException('Action must be APPROVE or REJECT');
  if (
    command.reason !== undefined &&
    (typeof command.reason !== 'string' ||
      command.reason.trim().length < 3 ||
      command.reason.trim().length > 2000)
  )
    throw new BadRequestException('Reason must contain 3 to 2000 characters');
  if (command.action === 'REJECT' && command.reason === undefined)
    throw new BadRequestException('A rejection reason is required');
  return {
    action: command.action,
    ...(typeof command.reason === 'string'
      ? { reason: command.reason.trim() }
      : {}),
  };
}

/**
 * Pure state validation, not an authorization or issuance token. Callers must
 * load the scoped registration/approval under locks, enforce the stage role,
 * revalidate prerequisites, and persist this plan with required audit atomically.
 */
export function planHallTicketApprovalTransition(
  current: HallTicketApprovalState,
  input: unknown,
) {
  const command = validateHallTicketApprovalCommand(input);
  const index = HALL_TICKET_APPROVAL_STAGES.findIndex(
    (stage) => stage === current.stage,
  );
  if (index < 0)
    throw new ConflictException(
      'Only a linked, pending approval stage can be advanced; legacy and terminal records require review',
    );
  if (
    STATUS_COLUMNS.some(
      (column, statusIndex) =>
        current[column] !== (statusIndex < index ? 'APPROVED' : 'PENDING'),
    ) ||
    current.approved_by !== null ||
    current.approved_at !== null ||
    !Array.isArray(current.block_reasons) ||
    current.block_reasons.some(
      (reason: unknown) => typeof reason !== 'string' || !reason.trim(),
    )
  )
    throw new ConflictException(
      'Approval stage, status or final-approval metadata is inconsistent; review the record',
    );
  if (command.action === 'APPROVE' && current.block_reasons.length)
    throw new ConflictException(
      'Resolve the recorded hall-ticket blockers before approving this stage',
    );
  const currentStage = HALL_TICKET_APPROVAL_STAGES[index];
  const final = command.action === 'APPROVE' && currentStage === 'COE';
  return {
    current_stage: currentStage,
    stage:
      command.action === 'REJECT'
        ? ('REJECTED' as const)
        : (HALL_TICKET_APPROVAL_STAGES[index + 1] ?? ('APPROVED' as const)),
    status_column: STATUS_COLUMNS[index],
    status:
      command.action === 'REJECT'
        ? ('REJECTED' as const)
        : ('APPROVED' as const),
    final,
    ...command,
  };
}
