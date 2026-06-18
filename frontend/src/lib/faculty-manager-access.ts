type ManagerAccessUser = {
  has_direct_reports?: boolean;
  role?: string;
  roles?: string[];
} | null | undefined;

const MANAGER_ROLES = new Set(['hod', 'dean', 'hr', 'hradmin', 'superadmin', 'president']);

/** Team-approval UI is hidden for regular faculty unless they have direct reports. */
export function canSeeFacultyTeamApprovals(user: ManagerAccessUser): boolean {
  if (!user) return false;
  const roles = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  if (roles.some((role) => MANAGER_ROLES.has(role.trim().toLowerCase()))) return true;
  return Boolean(user.has_direct_reports);
}
