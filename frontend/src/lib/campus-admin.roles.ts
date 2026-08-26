export const CAMPUS_ADMIN_ROLE = 'CampusAdmin';

export const CAMPUS_ADMIN_LOGIN_EMAIL = 'campusadmin@mygyanvihar.com';

/**
 * Roles associated with the Campus Admin portal family.
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
  return String(role ?? '').trim().toLowerCase();
}

export function isCampusAdminFamilyRole(role: string): boolean {
  return CAMPUS_ADMIN_ROLE_SET.has(normalizeRoleName(role));
}

/** Normalize only — does not grant SuperAdmin capabilities to Campus Admin. */
export function expandCampusAdminRoles(roles: string[]): string[] {
  return Array.from(new Set(roles.map(normalizeRoleName).filter(Boolean)));
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
  peopleStudents: `${CAMPUS_ADMIN_PORTAL_PREFIX}/people/students`,
  peopleFaculty: `${CAMPUS_ADMIN_PORTAL_PREFIX}/people/faculty`,
  peopleHods: `${CAMPUS_ADMIN_PORTAL_PREFIX}/people/hods`,
  peopleStaff: `${CAMPUS_ADMIN_PORTAL_PREFIX}/people/staff`,
  peopleUsers: `${CAMPUS_ADMIN_PORTAL_PREFIX}/people/users`,
  rolesPermissions: `${CAMPUS_ADMIN_PORTAL_PREFIX}/security/roles-permissions`,
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
  operationsRequestDetail: (ticketId: string) =>
    `${CAMPUS_ADMIN_PORTAL_PREFIX}/operations/requests/${encodeURIComponent(ticketId)}`,
  reports: `${CAMPUS_ADMIN_PORTAL_PREFIX}/reports`,
  analytics: `${CAMPUS_ADMIN_PORTAL_PREFIX}/analytics`,
  myLeave: `${CAMPUS_ADMIN_PORTAL_PREFIX}/my-leave`,
  accountSettings: `${CAMPUS_ADMIN_PORTAL_PREFIX}/account/settings`,
} as const;
