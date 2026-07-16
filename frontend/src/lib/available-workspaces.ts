import {
  getActiveWorkspaceRoleFromPath,
  getDashboardPathForRole,
  getWorkspaceLabelForRole,
  getWorkspaceShortLabelForRole,
} from '@/lib/auth-routing';
import { isRoleWorkspaceEnabled } from '@/lib/launch-modules';

/** User shape accepted by workspace helpers (auth user or temporary mocks). */
export type WorkspaceUserLike =
  | {
      role?: string;
      roles?: string[];
      primaryRole?: string;
    }
  | null
  | undefined;

export type AvailableWorkspace = {
  /** Normalized role key, e.g. `faculty`, `hod`, `dean`. */
  roleKey: string;
  /** Original role string from the user payload (preserves backend casing). */
  role: string;
  label: string;
  shortLabel: string;
  href: string;
};

/**
 * Switchable workspace roles in preferred menu order.
 * Add future hats here (Registrar, Principal, VC, …) without touching UI code.
 */
const WORKSPACE_ROLE_ORDER: readonly string[] = [
  'faculty',
  'hod',
  'dean',
  'registrar',
  'principal',
  'president',
  'chairman',
  'hr',
  'hradmin',
  'student',
  'applicant',
  'warden',
  'accountant',
  'iqac',
  'librarian',
  'parent',
  'alumni',
  'examcell',
  'exam cell',
  'superadmin',
  'placementcell',
  'placement cell',
  'incubation_admin',
  'ecelladmin',
  'transportofficer',
  'transport officer',
  'dc_member',
  'dc member',
];

export function normalizeWorkspaceRoleKey(role: string): string {
  return role.trim().toLowerCase();
}

/** Collect unique role strings from a user or mock `{ roles: [...] }` payload. */
export function resolveUserRoleList(user: WorkspaceUserLike): string[] {
  const raw = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  const seen = new Set<string>();
  const roles: string[] = [];

  for (const role of raw) {
    const trimmed = role?.trim();
    if (!trimmed) continue;
    const key = normalizeWorkspaceRoleKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push(trimmed);
  }

  return roles;
}

function workspaceSortIndex(roleKey: string): number {
  const index = WORKSPACE_ROLE_ORDER.indexOf(roleKey);
  return index === -1 ? WORKSPACE_ROLE_ORDER.length + roleKey.charCodeAt(0) : index;
}

/**
 * Returns only the workspaces the signed-in user can switch between.
 *
 * @example
 * getAvailableWorkspaces({ roles: ['FACULTY', 'HOD'] })
 * // → Faculty Workspace, HOD Workspace
 *
 * @example
 * getAvailableWorkspaces({ roles: ['Faculty', 'HOD', 'Dean'] })
 * // → Faculty, HOD, Dean workspaces (Dean only when role is present)
 */
export function getAvailableWorkspaces(user: WorkspaceUserLike): AvailableWorkspace[] {
  const workspaces: AvailableWorkspace[] = [];
  const seenKeys = new Set<string>();

  for (const role of resolveUserRoleList(user)) {
    if (!isRoleWorkspaceEnabled(role)) continue;

    const roleKey = normalizeWorkspaceRoleKey(role);
    if (seenKeys.has(roleKey)) continue;

    const href = getDashboardPathForRole(role);
    if (href === '/dashboard') continue;

    seenKeys.add(roleKey);
    workspaces.push({
      roleKey,
      role,
      label: getWorkspaceLabelForRole(role),
      shortLabel: getWorkspaceShortLabelForRole(role),
      href,
    });
  }

  workspaces.sort((a, b) => {
    const orderDiff = workspaceSortIndex(a.roleKey) - workspaceSortIndex(b.roleKey);
    if (orderDiff !== 0) return orderDiff;
    return a.label.localeCompare(b.label);
  });

  return workspaces;
}

export function resolveActiveWorkspaceRole(
  pathname: string,
  user: WorkspaceUserLike,
  workspaces: AvailableWorkspace[] = getAvailableWorkspaces(user),
): string | null {
  const roleList = workspaces.map((workspace) => workspace.role);
  const fromPath = getActiveWorkspaceRoleFromPath(pathname, roleList);
  if (fromPath) return fromPath;

  const fallback =
    user?.primaryRole?.trim() ||
    user?.role?.trim() ||
    workspaces[0]?.role ||
    null;

  if (!fallback) return null;

  const fallbackKey = normalizeWorkspaceRoleKey(fallback);
  const matched = workspaces.find((workspace) => workspace.roleKey === fallbackKey);
  return matched?.role ?? fallback;
}

export function findAvailableWorkspace(
  workspaces: AvailableWorkspace[],
  role: string | null | undefined,
): AvailableWorkspace | undefined {
  if (!role) return undefined;
  const key = normalizeWorkspaceRoleKey(role);
  return workspaces.find((workspace) => workspace.roleKey === key);
}
