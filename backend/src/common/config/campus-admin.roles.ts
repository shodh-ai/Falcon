/** Campus Admin portal role (distinct from Super Admin). */
export const CAMPUS_ADMIN_ROLE = 'CampusAdmin';

export const CAMPUS_ADMIN_LOGIN_EMAIL = 'campusadmin@mygyanvihar.com';

/**
 * Roles that share Campus Admin admissions surfaces.
 * SuperAdmin is intentionally excluded — never expand CampusAdmin → SuperAdmin.
 */
export const LEGACY_CAMPUS_ADMIN_ROLES = [
  CAMPUS_ADMIN_ROLE,
  'AdmissionsOfficer',
] as const;

const CAMPUS_ADMIN_ROLE_SET = new Set(
  LEGACY_CAMPUS_ADMIN_ROLES.map((role) => role.trim().toLowerCase()),
);

export function normalizeRoleName(role: string): string {
  return String(role ?? '')
    .trim()
    .toLowerCase();
}

export function isCampusAdminFamilyRole(role: string): boolean {
  return CAMPUS_ADMIN_ROLE_SET.has(normalizeRoleName(role));
}

/**
 * Normalize role names only. Does not inject SuperAdmin privileges.
 * AdmissionsOfficer and CampusAdmin remain distinct for portal admission.
 */
export function expandCampusAdminRoles(roles: string[]): string[] {
  return Array.from(
    new Set(roles.map(normalizeRoleName).filter(Boolean)),
  );
}

export function rolesIntersect(
  userRoles: string[],
  requiredRoles: string[],
): boolean {
  const expandedUser = new Set(expandCampusAdminRoles(userRoles));
  return requiredRoles.some((role) =>
    expandedUser.has(normalizeRoleName(role)),
  );
}
