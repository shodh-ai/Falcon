import { ForbiddenException } from '@nestjs/common';

/** Mirrors frontend `exam-cell-rbac.ts` action matrix. */
export type ExamCellAction =
  | 'view_dashboard'
  | 'manage_sessions'
  | 'manage_schedules'
  | 'generate_admit_cards'
  | 'manage_seating'
  | 'publish_results'
  | 'approve_ufm'
  | 'manage_qp';

const ROLE_ACTIONS: Record<string, ExamCellAction[]> = {
  superadmin: [
    'view_dashboard',
    'manage_sessions',
    'manage_schedules',
    'generate_admit_cards',
    'manage_seating',
    'publish_results',
    'approve_ufm',
    'manage_qp',
  ],
  examcell: [
    'view_dashboard',
    'manage_sessions',
    'manage_schedules',
    'generate_admit_cards',
    'manage_seating',
    'publish_results',
    'approve_ufm',
    'manage_qp',
  ],
  deputycoe: [
    'view_dashboard',
    'manage_sessions',
    'manage_schedules',
    'generate_admit_cards',
    'manage_seating',
    'publish_results',
    'approve_ufm',
  ],
  examadmin: [
    'view_dashboard',
    'manage_sessions',
    'manage_schedules',
    'generate_admit_cards',
    'manage_seating',
  ],
  examoperator: ['view_dashboard', 'generate_admit_cards', 'manage_seating'],
};

export function normalizeExamCellRole(role: string | undefined | null): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function canExamCellAction(
  role: string | undefined | null,
  action: ExamCellAction,
): boolean {
  const key = normalizeExamCellRole(role);
  return ROLE_ACTIONS[key]?.includes(action) ?? false;
}

export function assertExamCellAction(
  role: string | undefined | null,
  action: ExamCellAction,
): void {
  if (!canExamCellAction(role, action)) {
    throw new ForbiddenException(
      `Your role does not have permission to perform this action (${action}).`,
    );
  }
}

export function examCellRoleFromUser(user: {
  role?: string;
  primaryRole?: string;
}): string {
  return user.primaryRole ?? user.role ?? '';
}
