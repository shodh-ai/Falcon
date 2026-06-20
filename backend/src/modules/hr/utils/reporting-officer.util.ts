const FACULTY_LIKE_ROLES = new Set(['faculty', 'hod', 'dean']);

/** Resolve reporting officer: explicit override wins, else default to department HOD for faculty-like roles. */
export function resolveDefaultReportingOfficerId(params: {
  roleName: string | null | undefined;
  hodUserId: string | null | undefined;
  employeeUserId: string | null | undefined;
  explicitReportingOfficerId?: string | null;
}): string | null {
  if (params.explicitReportingOfficerId !== undefined) {
    return params.explicitReportingOfficerId;
  }

  const role = (params.roleName ?? '').trim().toLowerCase();
  if (!FACULTY_LIKE_ROLES.has(role)) {
    return null;
  }

  const hodUserId = params.hodUserId ?? null;
  if (!hodUserId) {
    return null;
  }

  if (params.employeeUserId && hodUserId === params.employeeUserId) {
    return null;
  }

  return hodUserId;
}

export async function fetchDepartmentHodUserId(
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<Array<{ hod_user_id: string | null }>>,
  deptId: number | null | undefined,
): Promise<string | null> {
  if (!deptId) return null;
  const rows = await query(
    `SELECT hod_user_id FROM departments WHERE dept_id = $1 LIMIT 1`,
    [deptId],
  );
  return rows[0]?.hod_user_id ?? null;
}

const MANAGER_PORTAL_ROLES = new Set([
  'hod',
  'dean',
  'hr',
  'hradmin',
  'superadmin',
  'president',
]);

/** True when the user is Faculty-only (no HOD/Dean/HR manager roles). */
export function isFacultyOnlyRole(roles: string[] | undefined | null): boolean {
  const normalized = (roles ?? [])
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
  if (normalized.some((role) => MANAGER_PORTAL_ROLES.has(role))) return false;
  return normalized.includes('faculty');
}

export async function hasDirectReports(
  query: (sql: string, params?: unknown[]) => Promise<Array<{ count: string }>>,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const rows = await query(
    `SELECT COUNT(*)::text AS count
     FROM users
     WHERE tenant_id = $1
       AND reporting_officer_id = $2
       AND is_active = true`,
    [tenantId, userId],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

/** Faculty-only users need direct reports before team-approval features are enabled. */
export async function canAccessTeamApprovals(
  query: (sql: string, params?: unknown[]) => Promise<Array<{ count: string }>>,
  tenantId: string,
  userId: string,
  roles: string[] | undefined | null,
): Promise<boolean> {
  if (!isFacultyOnlyRole(roles)) return true;
  return hasDirectReports(query, tenantId, userId);
}
