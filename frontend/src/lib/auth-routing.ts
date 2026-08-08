/**
 * Maps backend role_name to the correct portal dashboard.
 */
import {
  getOnboardingConfigForRole,
  getOnboardingStepPath,
  needsPortalOnboarding,
} from '@/lib/onboarding/portal-onboarding';
import { isPathHiddenForLaunch, isRoleWorkspaceEnabled } from '@/lib/launch-modules';
import {
  campusAdminRoutes,
  expandCampusAdminRoles,
} from '@/lib/campus-admin.roles';
import { CAMPUS_ADMIN_LOGIN_EMAIL } from '@/lib/campus-admin.roles';

export function getDashboardPathForRole(role: string | undefined | null): string {
  const r = (role ?? '').trim().toLowerCase();

  if (r === 'faculty') {
    return '/faculty/dashboard';
  }

  if (r === 'dean') {
    return '/dean/dashboard';
  }

  if (r === 'hod') {
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
    return isRoleWorkspaceEnabled('accountant') ? '/finance/dashboard' : '/dashboard';
  }

  if (r === 'iqac') {
    return '/iqac/dashboard';
  }

  if (r === 'librarian') {
    return isRoleWorkspaceEnabled('librarian') ? '/library/dashboard' : '/dashboard';
  }

  if (r === 'president' || r === 'vice chancellor') {
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

  if (r === 'examcell' || r === 'exam cell' || r === 'deputycoe' || r === 'examadmin' || r === 'examoperator') {
    return '/exam-cell/dashboard';
  }

  if (r === 'dc_member' || r === 'dc member') {
    return '/disciplinary-committee/dashboard';
  }

  if (r === 'drc_member' || r === 'drc member') {
    return '/research/drc/applications';
  }

  if (r === 'rac_member' || r === 'rac member') {
    return '/research/rac/reviews';
  }

  if (r === 'rrc_member' || r === 'rrc member') {
    return '/research/rrc/reviews';
  }

  if (r === 'phd_adjudicator' || r === 'phd adjudicator') {
    return '/research/adjudicator/reviews';
  }

  if (r === 'placementcell' || r === 'placement cell') {
    return '/placements/dashboard';
  }

  if (r === 'ecelladmin' || r === 'e-cell admin' || r === 'incubation_admin' || r === 'incubation admin') {
    return '/incubation/dashboard';
  }

  if (r === 'transportofficer' || r === 'transport officer') {
    return '/admin-ops/fleet';
  }

  if (r === 'campusadmin' || r === 'superadmin') {
    return campusAdminRoutes.dashboard;
  }

  if (r === 'registrar') {
    return '/admin/dashboard';
  }

  if (r.includes('admission')) {
    return campusAdminRoutes.admissionsPipeline;
  }

  return '/dashboard';
}

export function getWorkspaceLabelForRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return 'Student Workspace';
  if (r === 'faculty') return 'Faculty Workspace';
  if (r === 'hod') return 'HOD Workspace';
  if (r === 'dean') return 'Dean Workspace';
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
  if (r === 'dc_member' || r === 'dc member') return 'Disciplinary Committee';
  if (r === 'incubation_admin' || r === 'ecelladmin') return 'Incubation';
  if (r === 'campusadmin' || r === 'superadmin') return 'Campus Admin Workspace';
  if (r.includes('admission')) return 'Campus Admin Workspace';
  return `${role} Workspace`;
}

/** Compact label for header controls where space is limited */
export function getWorkspaceShortLabelForRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return 'Student';
  if (r === 'faculty') return 'Faculty';
  if (r === 'hod') return 'HOD';
  if (r === 'dean') return 'Dean';
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
  if (r === 'dc_member' || r === 'dc member') return 'DC';
  if (r === 'incubation_admin' || r === 'ecelladmin') return 'Incubation';
  if (r === 'campusadmin' || r === 'superadmin') return 'Campus Admin';
  if (r.includes('admission')) return 'Campus Admin';
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
  { prefix: '/hr/grievances', module: 'dashboard' },
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
  // Management console hubs deep-link into HR; keep portal access aligned.
  if (
    roles.some((r) =>
      ['hradmin', 'superadmin', 'campusadmin', 'hr', 'president', 'registrar'].includes(r),
    )
  ) {
    return true;
  }

  if (pathname.startsWith('/hr/admin')) {
    return roles.some((r) => ['hradmin', 'superadmin', 'campusadmin', 'registrar'].includes(r));
  }

  if (pathname.startsWith('/hr/me/') || pathname.startsWith('/hr/inbox')) {
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
  '/dean': ['dean'],
  '/hod': ['hod'],
  '/hr': [
    'hr',
    'hradmin',
    'superadmin',
    'campusadmin',
    'registrar',
    'faculty',
    'hod',
    'dean',
    'president',
    'accountant',
  ],
  '/ess': ['faculty', 'hod', 'dean', 'hr', 'superadmin'],
  '/hostel-admin': ['warden', 'superadmin'],
  '/finance': ['accountant', 'superadmin'],
  '/iqac': ['iqac', 'superadmin', 'registrar', 'president'],
  '/library': ['librarian', 'superadmin'],
  '/library-admin': ['librarian', 'superadmin'],
  '/president': ['president', 'vice chancellor', 'superadmin'],
  '/leadership': ['chairman', 'president', 'vice chancellor', 'superadmin', 'registrar'],
  '/parent': ['parent', 'superadmin'],
  '/exam-cell': ['examcell', 'superadmin', 'deputycoe', 'examadmin', 'examoperator'],
  '/disciplinary-committee': ['dc_member', 'superadmin'],
  '/alumni': ['alumni'],
  '/alumni-admin': ['iqac', 'superadmin', 'campusadmin', 'registrar', 'president'],
  '/admin-ops': ['registrar', 'superadmin', 'campusadmin', 'transportofficer'],
  '/placements': ['placementcell', 'superadmin', 'campusadmin', 'registrar'],
  '/incubation': ['incubation_admin', 'ecelladmin', 'superadmin', 'campusadmin', 'hod', 'dean', 'president'],
  '/ecell-admin': ['incubation_admin', 'ecelladmin', 'superadmin', 'campusadmin'],
  '/documents': ['student', 'faculty', 'registrar', 'superadmin', 'campusadmin', 'parent'],
  '/reports': ['registrar', 'superadmin', 'campusadmin', 'president', 'accountant'],
  '/admin': ['superadmin', 'campusadmin', 'registrar'],
  '/campus-admin': ['campusadmin', 'superadmin', 'admissionsofficer'],
  '/super-admin': ['campusadmin', 'superadmin', 'admissionsofficer'],
  '/admissions-crm': ['campusadmin', 'superadmin', 'admissionsofficer', 'registrar'],
  '/clinic-admin': ['registrar', 'superadmin', 'campusadmin'],
  '/directory': [
    'chairman',
    'president',
    'superadmin',
    'campusadmin',
    'registrar',
    'hradmin',
    'hr',
    'hod',
    'dean',
    'warden',
    'faculty',
    'student',
    'applicant',
  ],
  '/tickets': ['student', 'faculty', 'hod', 'dean', 'hr', 'hradmin', 'superadmin', 'campusadmin', 'registrar', 'parent'],
  '/research': ['iqac', 'faculty', 'hod', 'dean', 'chairman', 'superadmin', 'campusadmin', 'drc_member', 'rac_member', 'rrc_member', 'phd_adjudicator'],
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

const ENTITY_CREATOR_EMAIL = CAMPUS_ADMIN_LOGIN_EMAIL;

export function canRoleAccessPath(
  roleOrRoles: string | string[] | undefined | null,
  pathname: string,
  hrCapabilities?: HrCapabilities | null,
  permissions?: string[],
  email?: string,
): boolean {
  const roles = expandCampusAdminRoles(
    (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles])
      .filter((role): role is string => Boolean(role))
      .map((role) => role.trim().toLowerCase()),
  );

  if (
    pathname === '/campus-admin/entities' ||
    pathname.startsWith('/campus-admin/entities/') ||
    pathname === '/super-admin/entities' ||
    pathname.startsWith('/super-admin/entities/')
  ) {
    return (
      roles.includes('superadmin') &&
      (email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL
    );
  }

  if (pathname === '/directory' || pathname === '/directory/') {
    return roles.some((role) =>
      ['chairman', 'president', 'superadmin', 'campusadmin', 'registrar', 'hradmin', 'hr', 'hod', 'dean', 'warden', 'faculty'].includes(role),
    );
  }

  if (isPathHiddenForLaunch(pathname)) {
    return false;
  }

  if (pathname.startsWith('/admin-ops/directory') || pathname.startsWith('/directory/')) {
    return roles.some((role) =>
      ['chairman', 'president', 'superadmin', 'campusadmin', 'registrar', 'hod', 'dean', 'warden', 'faculty', 'hr', 'hradmin', 'student', 'applicant'].includes(role),
    );
  }

  const portal = Object.keys(portalRoles)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  // Shared authenticated surfaces (not portal-prefixed). Deny unknown roots.
  if (!portal) {
    const sharedAllow = [
      '/notifications',
      '/directory',
      '/account',
      '/ess',
      '/campus-admin',
      '/super-admin',
    ];
    return (
      roles.length > 0 &&
      sharedAllow.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      )
    );
  }
  if (portal === '/hr') {
    const inPortalRoles = roles.some((role) => portalRoles[portal].includes(role));
    if (!inPortalRoles && !hasAnyHrCapability(hrCapabilities) && !permissions?.length) return false;
    return canAccessHrPath(roles, pathname, hrCapabilities, permissions);
  }

  // Pure Registrar: block Admin module hubs that are intentionally nav-hidden
  // (Finance, HR, IQAC, Operations, Settings, Ph.D. demo). CampusAdmin/SuperAdmin keep access.
  if (
    portal === '/admin' &&
    roles.includes('registrar') &&
    !roles.includes('campusadmin') &&
    !roles.includes('superadmin')
  ) {
    const registrarDeniedPrefixes = [
      '/admin/finance',
      '/admin/hr',
      '/admin/iqac',
      '/admin/operations',
      '/admin/settings',
      '/admin/phd',
    ];
    if (
      registrarDeniedPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      )
    ) {
      return false;
    }
  }

  return roles.some((role) => portalRoles[portal].includes(role));
}

const EXPLICIT_PORTAL_PROFILE_PATHS: Record<string, string> = {
  '/student': '/student/profile',
  '/faculty': '/faculty/profile',
  '/dean': '/dean/profile',
  '/hod': '/hod/profile',
  '/alumni': '/alumni/profile',
  '/hr': '/hr/me/documents',
  '/exam-cell': '/exam-cell/profile',
  '/president': '/president/settings',
};

const EXPLICIT_PORTAL_SETTINGS_PATHS: Record<string, string> = {
  '/hr': '/hr/me/settings',
  '/hostel-admin': '/hostel-admin/account/settings',
  '/campus-admin': campusAdminRoutes.accountSettings,
  '/super-admin': campusAdminRoutes.accountSettings,
  '/ecell-admin': '/ecell-admin/account/settings',
  '/incubation': '/incubation/account/settings',
  '/admin': '/admin/account/settings',
};

/** Account settings href for a portal prefix (e.g. `/student`, `/hr`). */
export function getAccountSettingsHrefForPortal(portal: string): string {
  const normalized = portal.startsWith('/') ? portal : `/${portal}`;
  return EXPLICIT_PORTAL_SETTINGS_PATHS[normalized] ?? `${normalized}/settings`;
}

/** Resolve account settings for the active portal. */
export function getSettingsHrefFromPath(pathname: string, role?: string | null): string {
  if (pathname.startsWith('/ess')) {
    const dash = getDashboardPathForRole(role);
    return getSettingsHrefFromPath(dash, role);
  }

  const portal = Object.keys(portalRoles)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (portal) {
    return getAccountSettingsHrefForPortal(portal);
  }

  return '/faculty/settings';
}

/** Resolve the user profile page for the active portal (never the dashboard). */
export function getProfileHrefFromPath(pathname: string, role?: string | null): string {
  if (pathname.startsWith('/ess')) {
    const dash = getDashboardPathForRole(role);
    if (dash.startsWith('/dean')) return '/dean/profile';
    if (dash.startsWith('/hod')) return '/hod/profile';
    if (dash.startsWith('/hr')) return '/hr/me/documents';
    return '/faculty/profile';
  }

  const portal = Object.keys(portalRoles)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (portal && EXPLICIT_PORTAL_PROFILE_PATHS[portal]) {
    return EXPLICIT_PORTAL_PROFILE_PATHS[portal];
  }

  if (portal) {
    return `${portal}/profile`;
  }

  return '/student/profile';
}

/** Prefer an explicit profile link; ignore dashboard/home links misconfigured as profile. */
export function resolveProfileHref(
  pathname: string,
  role?: string | null,
  explicitHref?: string,
): string {
  if (
    explicitHref &&
    (explicitHref.includes('/profile') || explicitHref.includes('/me/documents'))
  ) {
    return explicitHref;
  }
  return getProfileHrefFromPath(pathname, role);
}

export function getPostLoginPath(user: {
  role?: string;
  primaryRole?: string;
  roles?: string[];
  is_department_hod?: boolean;
  onboarding_status?: string;
}): string {
  const roles = (user.roles ?? [user.primaryRole ?? user.role])
    .filter((role): role is string => Boolean(role))
    .map((role) => role.trim().toLowerCase());
  const hasHodRole = roles.includes('hod');
  const primaryRole = user.primaryRole ?? user.role;

  // Department heads (including Deans mapped as hod_user_id) use the HOD Command Center.
  const landingRole =
    user.is_department_hod || hasHodRole ? 'HOD' : primaryRole;

  const config = getOnboardingConfigForRole(landingRole);
  if (config) {
    const onboardingPath = getOnboardingStepPath(
      config.portalPrefix,
      user.onboarding_status,
      landingRole,
    );
    if (onboardingPath) return onboardingPath;
  }
  return getDashboardPathForRole(landingRole);
}

export { needsPortalOnboarding };
