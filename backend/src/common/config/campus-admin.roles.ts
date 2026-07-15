/** Campus Admin merges legacy Super Admin + Admissions Officer capabilities. */
export const CAMPUS_ADMIN_ROLE = 'CampusAdmin';

export const CAMPUS_ADMIN_LOGIN_EMAIL = 'campusadmin@mygyanvihar.com';

export const LEGACY_CAMPUS_ADMIN_ROLES = [
  CAMPUS_ADMIN_ROLE,
  'SuperAdmin',
  'AdmissionsOfficer',
] as const;

const CAMPUS_ADMIN_ROLE_SET = new Set(
  LEGACY_CAMPUS_ADMIN_ROLES.map((role) => role.trim().toLowerCase()),
);

export function normalizeRoleName(role: string): string {
  return String(role ?? '').trim().toLowerCase();
}

export function isCampusAdminFamilyRole(role: string): boolean {
  return CAMPUS_ADMIN_ROLE_SET.has(normalizeRoleName(role));
}

/** Expand user roles so CampusAdmin satisfies legacy SuperAdmin / AdmissionsOfficer gates. */
export function expandCampusAdminRoles(roles: string[]): string[] {
  const expanded = new Set(roles.map(normalizeRoleName).filter(Boolean));
  if ([...expanded].some(isCampusAdminFamilyRole)) {
    for (const role of CAMPUS_ADMIN_ROLE_SET) {
      expanded.add(role);
    }
  }
  return [...expanded];
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
