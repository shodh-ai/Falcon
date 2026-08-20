import { campusAdminRoutes, expandCampusAdminRoles } from '@/lib/campus-admin.roles';

const ADMISSIONS_WORKFORCE_ROLES = new Set([
  'admissionsofficer',
  'registrar',
  'campusadmin',
  'superadmin',
]);

export function workforceStatusPathForRole(roleName: string | null | undefined): string {
  const normalized = (roleName ?? '').trim().toLowerCase();
  if (ADMISSIONS_WORKFORCE_ROLES.has(normalized)) {
    return campusAdminRoutes.myLeave;
  }
  return '/faculty/leaves';
}

export function usesCampusAdminAdmissionsPath(pathname?: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith('/campus-admin') ||
    pathname.startsWith('/admissions-crm')
  );
}

export function expandedRoleSet(roleName: string | null | undefined): Set<string> {
  return new Set(expandCampusAdminRoles([roleName ?? '']));
}
