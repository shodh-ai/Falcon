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

export type ExamCellRoleInput = string | string[] | undefined | null;

function roleValues(role: ExamCellRoleInput): string[] {
  return Array.isArray(role) ? role : [role ?? ''];
}

export function canExamCellAction(
  role: ExamCellRoleInput,
  action: ExamCellAction,
): boolean {
  return roleValues(role).some((value) => {
    const key = normalizeExamCellRole(value);
    return ROLE_ACTIONS[key]?.includes(action) ?? false;
  });
}

export function assertExamCellAction(
  role: ExamCellRoleInput,
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
  roles?: string[];
}): string {
  return examCellRolesFromUser(user)[0] ?? '';
}

export function examCellRolesFromUser(user: {
  role?: string;
  primaryRole?: string;
  roles?: string[];
}): string[] {
  return [
    ...(user.roles ?? []),
    user.primaryRole,
    user.role,
  ].filter((value): value is string => Boolean(value?.trim()));
}
