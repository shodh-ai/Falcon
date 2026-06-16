/**
 * Maps backend role_name to the correct portal dashboard.
 */
export function getDashboardPathForRole(role: string | undefined | null): string {
  const r = (role ?? '').trim().toLowerCase();

  if (r === 'faculty') {
    return '/faculty/dashboard';
  }

  if (r === 'hod' || r === 'dean') {
    return '/hod/dashboard';
  }

  if (r === 'student' || r === 'applicant') {
    return '/student/dashboard';
  }

  if (r === 'hr' || r === 'hradmin') {
    return '/hr/dashboard';
  }

  if (r === 'warden') {
    return '/hostel-admin/dashboard';
  }

  if (r === 'accountant') {
    return '/finance/dashboard';
  }

  if (r === 'iqac') {
    return '/iqac/dashboard';
  }

  if (r === 'librarian') {
    return '/library/dashboard';
  }

  if (r === 'president') {
    return '/president/executive-summary';
  }

  if (r === 'chairman') {
    return '/leadership/overview';
  }

  if (r === 'parent') {
    return '/parent/dashboard';
  }

  if (r === 'alumni') {
    return '/alumni/dashboard';
  }

  if (r === 'examcell' || r === 'exam cell') {
    return '/exam-cell/dashboard';
  }

  if (r === 'placementcell' || r === 'placement cell') {
    return '/placements/dashboard';
  }

  if (r === 'transportofficer' || r === 'transport officer') {
    return '/admin-ops/fleet';
  }

  if (r === 'superadmin') {
    return '/super-admin/dashboard';
  }

  if (
    r === 'registrar' ||
    r.includes('admission')
  ) {
    return r.includes('admission') ? '/admissions-crm/pipeline' : '/admin/dashboard';
  }

  return '/dashboard';
}

export function getWorkspaceLabelForRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return 'Student Workspace';
  if (r === 'faculty') return 'Faculty Workspace';
  if (r === 'hod' || r === 'dean') return 'HOD Workspace';
  if (r === 'hr' || r === 'hradmin') return 'HR Workspace';
  if (r === 'warden') return 'Hostel Workspace';
  if (r === 'accountant') return 'Finance Workspace';
  if (r === 'iqac') return 'IQAC Workspace';
  if (r === 'librarian') return 'Library Workspace';
  if (r === 'president') return 'Executive Workspace';
  if (r === 'chairman') return 'Executive Command Center';
  if (r === 'parent') return 'Parent Workspace';
  if (r === 'alumni') return 'Alumni Network';
  if (r === 'examcell' || r === 'exam cell') return 'Exam Cell Workspace';
  return `${role} Workspace`;
}

/** Compact label for header controls where space is limited */
export function getWorkspaceShortLabelForRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return 'Student';
  if (r === 'faculty') return 'Faculty';
  if (r === 'hod' || r === 'dean') return 'HOD';
  if (r === 'hr' || r === 'hradmin') return 'HR';
  if (r === 'warden') return 'Hostel';
  if (r === 'accountant') return 'Finance';
  if (r === 'iqac') return 'IQAC';
  if (r === 'librarian') return 'Library';
  if (r === 'president') return 'Executive';
  if (r === 'chairman') return 'Chairman';
  if (r === 'parent') return 'Parent';
  if (r === 'alumni') return 'Alumni';
  if (r === 'examcell' || r === 'exam cell') return 'Exam Cell';
  return role;
}

export type EssParentWorkspace = {
  label: string;
  shortLabel: string;
  href: string;
};

type EssUserLike =
  | {
      role?: string;
      roles?: string[];
      primaryRole?: string;
    }
  | null
  | undefined;

/** Parent workspace when viewing ESS (Faculty, HOD, HR, etc.). */
export function getEssParentWorkspace(user: EssUserLike): EssParentWorkspace {
  const role = user?.primaryRole ?? user?.role ?? user?.roles?.[0] ?? 'Faculty';
  return {
    label: getWorkspaceLabelForRole(role),
    shortLabel: getWorkspaceShortLabelForRole(role),
    href: getDashboardPathForRole(role),
  };
}

const ESS_RETURN_KEY = 'ess_return_to';

/** Resolve back link: ?from= query, then sessionStorage, then role dashboard. */
export function resolveEssBackHref(fromQuery: string | null, parent: EssParentWorkspace): string {
  if (fromQuery && fromQuery.startsWith('/') && !fromQuery.startsWith('//')) {
    return fromQuery;
  }
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem(ESS_RETURN_KEY);
    if (stored?.startsWith('/') && !stored.startsWith('//')) {
      return stored;
    }
  }
  return parent.href;
}

export function persistEssReturnTo(href: string) {
  if (typeof window !== 'undefined' && href.startsWith('/') && !href.startsWith('//')) {
    sessionStorage.setItem(ESS_RETURN_KEY, href);
  }
}

const ESS_BREADCRUMB_LEAVES: Array<{ prefix: string; label: string }> = [
  { prefix: '/ess/team/dashboard', label: 'Team Dashboard' },
  { prefix: '/ess/team/attendance', label: 'Team Attendance' },
  { prefix: '/ess/team/requests', label: 'Pending on Me' },
  { prefix: '/ess/calendar', label: 'My Calendar' },
  { prefix: '/ess/leaves', label: 'Leaves' },
  { prefix: '/ess/documents', label: 'Document Vault' },
  { prefix: '/ess/policies', label: 'Company Policies' },
  { prefix: '/ess/onboarding', label: 'Onboarding' },
  { prefix: '/ess/offboarding', label: 'Resignation' },
];

export function isEssTeamPath(pathname: string): boolean {
  return pathname === '/ess/team' || pathname.startsWith('/ess/team/');
}

export function getEssBreadcrumbLeaf(pathname: string): string {
  const match = [...ESS_BREADCRUMB_LEAVES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));
  return match?.label ?? 'Employee Self-Service';
}

export type HrCapabilities = Partial<Record<string, 'none' | 'read' | 'write'>>;

const hrPathModules: Array<{ prefix: string; module: string }> = [
  { prefix: '/hr/admin', module: '__admin__' },
  { prefix: '/hr/reports', module: 'reports' },
  { prefix: '/hr/dashboard', module: 'dashboard' },
  { prefix: '/hr/recruitment', module: 'recruitment' },
  { prefix: '/hr/directory', module: 'directory' },
  { prefix: '/hr/employee', module: 'directory' },
  { prefix: '/hr/kyc', module: 'documents' },
  { prefix: '/hr/attendance', module: 'attendance' },
  { prefix: '/hr/leaves', module: 'leaves' },
  { prefix: '/hr/payroll', module: 'payroll' },
  { prefix: '/hr/onboarding', module: 'onboarding' },
  { prefix: '/hr/offboarding', module: 'offboarding' },
  { prefix: '/hr/policies', module: 'policies' },
  { prefix: '/hr/appraisals', module: 'directory' },
  { prefix: '/hr/promotions', module: 'directory' },
];

function hasAnyHrCapability(caps?: HrCapabilities | null): boolean {
  if (!caps) return false;
  return Object.values(caps).some((v) => v && v !== 'none');
}

function hasHrPermissionList(
  permissions: string[] | undefined,
  module: string,
  minLevel: 'read' | 'write' = 'read',
): boolean {
  if (!permissions?.length) return false;
  const levels = minLevel === 'write' ? ['write'] : ['read', 'write'];
  return permissions.some((p) => {
    const [mod, level] = p.split(':');
    return mod === module && levels.includes(level);
  });
}

function canAccessHrPath(
  roles: string[],
  pathname: string,
  caps?: HrCapabilities | null,
  permissions?: string[],
): boolean {
  if (roles.some((r) => ['hradmin', 'superadmin', 'hr', 'president'].includes(r))) return true;

  if (pathname.startsWith('/hr/admin')) {
    return roles.some((r) => ['hradmin', 'superadmin'].includes(r));
  }

  if (pathname.startsWith('/hr/me/attendance-holidays')) {
    return true; // Accessible to all roles permitted into the /hr portal
  }

  const match = [...hrPathModules]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));

  if (!match) return hasAnyHrCapability(caps) || Boolean(permissions?.length);
  if (permissions?.length) return hasHrPermissionList(permissions, match.module, 'read');
  const access = caps?.[match.module] ?? 'none';
  return access !== 'none';
}

const portalRoles: Record<string, string[]> = {
  '/student': ['student', 'applicant'],
  '/faculty': ['faculty'],
  '/hod': ['hod', 'dean'],
  '/hr': ['hr', 'hradmin', 'superadmin', 'faculty', 'hod', 'dean', 'president', 'accountant'],
  '/ess': ['faculty', 'hod', 'dean', 'hr', 'superadmin'],
  '/hostel-admin': ['warden', 'superadmin'],
  '/finance': ['accountant', 'superadmin'],
  '/iqac': ['iqac', 'superadmin', 'registrar', 'president'],
  '/library': ['librarian', 'superadmin'],
  '/library-admin': ['librarian', 'superadmin'],
  '/president': ['president', 'superadmin'],
  '/leadership': ['chairman', 'president', 'superadmin', 'registrar'],
  '/parent': ['parent', 'superadmin'],
  '/exam-cell': ['examcell', 'superadmin'],
  '/alumni': ['alumni'],
  '/alumni-admin': ['iqac', 'superadmin', 'registrar', 'president'],
  '/admin-ops': ['registrar', 'superadmin', 'transportofficer'],
  '/placements': ['placementcell', 'superadmin', 'registrar'],
  '/documents': ['student', 'faculty', 'registrar', 'superadmin', 'parent'],
  '/reports': ['registrar', 'superadmin', 'president', 'accountant'],
  '/admin': ['superadmin', 'registrar'],
  '/super-admin': ['superadmin'],
  '/admissions-crm': ['superadmin', 'admissionsofficer', 'registrar'],
  '/clinic-admin': ['registrar', 'superadmin'],
  '/research': ['iqac', 'faculty', 'hod', 'dean', 'chairman', 'superadmin'],
};

/** Derive the active workspace role from the current pathname (for multi-role users). */
export function getActiveWorkspaceRoleFromPath(
  pathname: string,
  userRoles: string[],
): string | null {
  const normalized = userRoles.map((r) => r.trim().toLowerCase());
  const portal = Object.keys(portalRoles)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!portal) return null;
  const allowed = portalRoles[portal];
  const match = normalized.find((r) => allowed.includes(r));
  return match ? userRoles[normalized.indexOf(match)] ?? match : null;
}

const ENTITY_CREATOR_EMAIL = 'superadmin@mygyanvihar.com';

export function canRoleAccessPath(
  roleOrRoles: string | string[] | undefined | null,
  pathname: string,
  hrCapabilities?: HrCapabilities | null,
  permissions?: string[],
  email?: string,
): boolean {
  const roles = (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles])
    .filter((role): role is string => Boolean(role))
    .map((role) => role.trim().toLowerCase());

  if (pathname === '/super-admin/entities' || pathname.startsWith('/super-admin/entities/')) {
    return (
      roles.includes('superadmin') &&
      (email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL
    );
  }

  if (pathname === '/directory' || pathname === '/directory/') {
    return roles.some((role) =>
      ['chairman', 'president', 'superadmin', 'registrar', 'hradmin', 'hr', 'hod', 'dean', 'warden', 'faculty'].includes(role),
    );
  }

  if (pathname.startsWith('/admin-ops/directory') || pathname.startsWith('/directory/')) {
    return roles.some((role) =>
      ['chairman', 'president', 'superadmin', 'registrar', 'hod', 'dean', 'warden', 'faculty', 'hr', 'hradmin', 'student', 'applicant'].includes(role),
    );
  }

  const portal = Object.keys(portalRoles)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!portal) return true;
  if (portal === '/hr') {
    const inPortalRoles = roles.some((role) => portalRoles[portal].includes(role));
    if (!inPortalRoles && !hasAnyHrCapability(hrCapabilities) && !permissions?.length) return false;
    return canAccessHrPath(roles, pathname, hrCapabilities, permissions);
  }
  return roles.some((role) => portalRoles[portal].includes(role));
}

export const STUDENT_ONBOARDING_STATUSES = [
  'PENDING_PASSWORD_RESET',
  'PENDING_DOCUMENTS',
  'PENDING_ADMIN_APPROVAL',
] as const;

export function isStudentRole(role: string | undefined | null): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'student' || r === 'applicant';
}

export function isStudentOnboardingComplete(status: string | undefined | null): boolean {
  const s = (status ?? 'ACTIVE').trim();
  return s === 'COMPLETED' || s === 'ACTIVE';
}

export function getStudentOnboardingPath(status: string | undefined | null): string | null {
  switch ((status ?? '').trim()) {
    case 'PENDING_PASSWORD_RESET':
      return '/student/onboarding/step-1';
    case 'PENDING_DOCUMENTS':
      return '/student/onboarding/step-2';
    case 'PENDING_ADMIN_APPROVAL':
      return '/student/onboarding/step-3';
    default:
      return null;
  }
}

export function getPostLoginPath(user: {
  role?: string;
  primaryRole?: string;
  onboarding_status?: string;
}): string {
  const role = user.primaryRole ?? user.role;
  if (isStudentRole(role) && user.onboarding_status) {
    const onboardingPath = getStudentOnboardingPath(user.onboarding_status);
    if (onboardingPath) return onboardingPath;
  }
  return getDashboardPathForRole(role);
}
