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

export function expandCampusAdminRoles(roles: string[]): string[] {
  const expanded = new Set(roles.map(normalizeRoleName).filter(Boolean));
  if ([...expanded].some(isCampusAdminFamilyRole)) {
    for (const role of CAMPUS_ADMIN_ROLE_SET) {
      expanded.add(role);
    }
  }
  return [...expanded];
}

export function rolesIncludeAny(
  userRoles: string[],
  requiredRoles: string[],
): boolean {
  const expanded = new Set(expandCampusAdminRoles(userRoles));
  return requiredRoles.some((role) => expanded.has(normalizeRoleName(role)));
}

export function rolesMatchForAccess(
  userRole: string | undefined | null,
  allowedRoles: string[],
): boolean {
  if (!userRole) return false;
  return rolesIncludeAny([userRole], allowedRoles);
}

export const CAMPUS_ADMIN_PORTAL_PREFIX = '/campus-admin';

export const campusAdminRoutes = {
  dashboard: `${CAMPUS_ADMIN_PORTAL_PREFIX}/dashboard`,
  entities: `${CAMPUS_ADMIN_PORTAL_PREFIX}/entities`,
  hierarchy: `${CAMPUS_ADMIN_PORTAL_PREFIX}/hierarchy`,
  impersonation: `${CAMPUS_ADMIN_PORTAL_PREFIX}/impersonation`,
  overrideLogs: `${CAMPUS_ADMIN_PORTAL_PREFIX}/override-logs`,
  settings: `${CAMPUS_ADMIN_PORTAL_PREFIX}/settings`,
  accountSettings: `${CAMPUS_ADMIN_PORTAL_PREFIX}/account/settings`,
  admissionsPipeline: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/pipeline`,
  admissionsVerifications: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/verifications`,
  admissionsEnrolledStudents: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/enrolled-students`,
  admissionsCounseling: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/counseling`,
  admissionsLeaves: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/leaves`,
} as const;
