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
  campusProfile: `${CAMPUS_ADMIN_PORTAL_PREFIX}/campus-profile`,
  hierarchy: `${CAMPUS_ADMIN_PORTAL_PREFIX}/hierarchy`,
  departments: `${CAMPUS_ADMIN_PORTAL_PREFIX}/departments`,
  programsCourses: `${CAMPUS_ADMIN_PORTAL_PREFIX}/programs-courses`,
  facultyStaff: `${CAMPUS_ADMIN_PORTAL_PREFIX}/faculty-staff`,
  students: `${CAMPUS_ADMIN_PORTAL_PREFIX}/students`,
  admissionsApplications: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/applications`,
  admissionsKanban: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/kanban`,
  admissionsVerifications: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/verifications`,
  admissionsCounselling: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/counselling`,
  admissionsEnrolledStudents: `${CAMPUS_ADMIN_PORTAL_PREFIX}/admissions/enrolled-students`,
  academicsCalendar: `${CAMPUS_ADMIN_PORTAL_PREFIX}/academics/calendar`,
  academicsTimetable: `${CAMPUS_ADMIN_PORTAL_PREFIX}/academics/timetable`,
  academicsClassrooms: `${CAMPUS_ADMIN_PORTAL_PREFIX}/academics/classrooms`,
  operationsAnnouncements: `${CAMPUS_ADMIN_PORTAL_PREFIX}/operations/announcements`,
  operationsEvents: `${CAMPUS_ADMIN_PORTAL_PREFIX}/operations/events`,
  operationsFacilities: `${CAMPUS_ADMIN_PORTAL_PREFIX}/operations/facilities`,
  operationsRequests: `${CAMPUS_ADMIN_PORTAL_PREFIX}/operations/requests`,
  reports: `${CAMPUS_ADMIN_PORTAL_PREFIX}/reports`,
  analytics: `${CAMPUS_ADMIN_PORTAL_PREFIX}/analytics`,
  myLeave: `${CAMPUS_ADMIN_PORTAL_PREFIX}/my-leave`,
  accountSettings: `${CAMPUS_ADMIN_PORTAL_PREFIX}/account/settings`,
} as const;
