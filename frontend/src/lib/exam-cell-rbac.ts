/** Examination Cell RBAC — mirrors backend role-permissions.matrix resources. */

export const EXAM_CELL_PORTAL_ROLES = [
  'examcell',
  'superadmin',
  'deputycoe',
  'examadmin',
  'examoperator',
] as const;

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
  superadmin: ['view_dashboard', 'manage_sessions', 'manage_schedules', 'generate_admit_cards', 'manage_seating', 'publish_results', 'approve_ufm', 'manage_qp'],
  examcell: ['view_dashboard', 'manage_sessions', 'manage_schedules', 'generate_admit_cards', 'manage_seating', 'publish_results', 'approve_ufm', 'manage_qp'],
  deputycoe: ['view_dashboard', 'manage_sessions', 'manage_schedules', 'generate_admit_cards', 'manage_seating', 'publish_results', 'approve_ufm'],
  examadmin: ['view_dashboard', 'manage_sessions', 'manage_schedules', 'generate_admit_cards', 'manage_seating'],
  examoperator: ['view_dashboard', 'generate_admit_cards', 'manage_seating'],
};

export function normalizeExamCellRole(role: string | undefined | null): string {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function canExamCellAction(
  roles: string | string[] | undefined | null,
  action: ExamCellAction,
): boolean {
  const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
  const normalized = list.map(normalizeExamCellRole);
  return normalized.some((r) => ROLE_ACTIONS[r]?.includes(action));
}

export function hasExamCellPortalAccess(roles: string | string[] | undefined | null): boolean {
  const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return list.some((r) => EXAM_CELL_PORTAL_ROLES.includes(normalizeExamCellRole(r) as typeof EXAM_CELL_PORTAL_ROLES[number]));
}
