import { normalizeRoles } from '@/lib/quick-action-access';

const ADMISSIONS_CRM_ROLES = new Set(['admissionsofficer', 'registrar']);

export function usesAdmissionsWorkforceApi(
  user: { role?: string | null; roles?: string[] | null; primaryRole?: string | null } | null | undefined,
  pathname?: string | null,
): boolean {
  if (pathname?.startsWith('/admissions-crm')) return true;
  return normalizeRoles(user).some((role) => ADMISSIONS_CRM_ROLES.has(role));
}

export function workforceRequestsApi(
  user: { role?: string | null; roles?: string[] | null; primaryRole?: string | null } | null | undefined,
  pathname?: string | null,
): string {
  return usesAdmissionsWorkforceApi(user, pathname)
    ? '/api/admissions-crm/self-service/workforce/requests'
    : '/api/hr/workforce/requests';
}

export function workforceMyRequestsApi(
  user: { role?: string | null; roles?: string[] | null; primaryRole?: string | null } | null | undefined,
  pathname?: string | null,
): string {
  return usesAdmissionsWorkforceApi(user, pathname)
    ? '/api/admissions-crm/self-service/workforce/my-requests'
    : '/api/hr/workforce/my-requests';
}
