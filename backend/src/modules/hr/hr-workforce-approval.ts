import type {
  StaffRequestType,
  StaffLeaveStatus,
} from '../../entities/staff-leave-request.entity';

export const TWO_STAGE_HR_REQUEST_TYPES: readonly StaffRequestType[] = [
  'LEAVE',
  'ON_DUTY',
  'REGULARIZATION',
];

export type WorkflowApproverStage = {
  approver_type: string;
  approver_ref?: string | null;
};

export function isWorkflowApproverStage(
  value: unknown,
): value is WorkflowApproverStage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'approver_type' in value &&
    typeof value.approver_type === 'string' &&
    (!('approver_ref' in value) ||
      value.approver_ref === null ||
      typeof value.approver_ref === 'string')
  );
}

const HR_ROLE_NAMES = new Set(['HR', 'HRADMIN', 'SUPERADMIN']);

export function isHrFinalApprovalStage(stage: WorkflowApproverStage): boolean {
  const type = stage.approver_type.toUpperCase();
  if (type === 'HR_EXECUTIVE' || type === 'HR_ADMIN') return true;
  return (
    type === 'ROLE' &&
    HR_ROLE_NAMES.has((stage.approver_ref ?? '').toUpperCase())
  );
}

export function statusForApprovalStage(stepOrder: number): StaffLeaveStatus {
  return stepOrder === 2 ? 'HOD_APPROVED' : 'PENDING';
}

export function isTwoStageHrRequest(requestType: StaffRequestType): boolean {
  return TWO_STAGE_HR_REQUEST_TYPES.includes(requestType);
}
