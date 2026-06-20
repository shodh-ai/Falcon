const ADMISSIONS_CRM_ROLES = new Set(['AdmissionsOfficer', 'Registrar']);

/** Portal path where staff can view their workforce request status. */
export function workforceStatusPathForRole(roleName: string | null | undefined): string {
  if (roleName && ADMISSIONS_CRM_ROLES.has(roleName)) {
    return '/admissions-crm/leaves';
  }
  return '/faculty/leaves';
}

/** Prefer admissions CRM when any mapped role applies (primary or secondary). */
export function workforceStatusPathForRoles(roleNames: Array<string | null | undefined>): string {
  if (roleNames.some((role) => role && ADMISSIONS_CRM_ROLES.has(role))) {
    return '/admissions-crm/leaves';
  }
  return workforceStatusPathForRole(roleNames[0]);
}
