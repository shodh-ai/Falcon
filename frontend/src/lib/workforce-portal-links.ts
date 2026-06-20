const ADMISSIONS_CRM_ROLES = new Set(['admissionsofficer', 'registrar']);

export function workforceStatusPathForRole(roleName: string | null | undefined): string {
  const normalized = (roleName ?? '').trim().toLowerCase();
  if (ADMISSIONS_CRM_ROLES.has(normalized)) {
    return '/admissions-crm/leaves';
  }
  return '/faculty/leaves';
}
