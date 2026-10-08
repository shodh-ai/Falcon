/** Mirror backend WORKFORCE_SELF_SERVICE_ROLES for Quick Action gating. */
export const WORKFORCE_SELF_SERVICE_ROLES = [
  'faculty',
  'hod',
  'dean',
  'hr',
  'hradmin',
  'superadmin',
  'campusadmin',
  'admissionsofficer',
  'registrar',
  'accountant',
  'warden',
  'examcell',
  'iqac',
  'librarian',
  'placementcell',
  'transportofficer',
  'dc_member',
] as const;

export const HELPDESK_REQUESTER_ROLES = [
  'student',
  'faculty',
  'hod',
  'dean',
  'hr',
  'hradmin',
  'superadmin',
  'campusadmin',
  'admissionsofficer',
  'registrar',
  'accountant',
  'warden',
  'examcell',
  'iqac',
  'librarian',
  'placementcell',
  'transportofficer',
  'dc_member',
] as const;

export function normalizeRoles(user: {
  role?: string | null;
  roles?: string[] | null;
  primaryRole?: string | null;
} | null | undefined): string[] {
  const raw = [
    ...(user?.roles ?? []),
    user?.primaryRole,
    user?.role,
  ].filter(Boolean) as string[];
  return Array.from(new Set(raw.map((r) => r.trim().toLowerCase().replace(/[\s_-]+/g, ''))));
}

export function userHasAnyRole(
  user: { role?: string | null; roles?: string[] | null; primaryRole?: string | null } | null | undefined,
  allowed: readonly string[],
): boolean {
  const roles = normalizeRoles(user);
  return allowed.some((role) => roles.includes(role));
}

export function canUseWorkforceQuickActions(user: Parameters<typeof userHasAnyRole>[0]) {
  return userHasAnyRole(user, WORKFORCE_SELF_SERVICE_ROLES);
}

export function canRaiseHelpdeskTicket(user: Parameters<typeof userHasAnyRole>[0]) {
  return userHasAnyRole(user, HELPDESK_REQUESTER_ROLES);
}
