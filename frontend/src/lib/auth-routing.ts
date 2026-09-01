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

  if (r === 'accountant' || r === 'cfo' || r === 'apmanager' || r === 'apclerk' || r === 'financecontroller') {
    return isRoleWorkspaceEnabled('accountant') ? '/finance/dashboard' : '/dashboard';
  }

  if (r === 'internalauditor') {
    return '/leadership/org-chart';
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

  if (r === 'ecelladmin' || r === 'e-cell admin' || r === 'incubation_admin' || r === 'incubation admin' || r === 'fellowshipadmin') {
    return '/incubation/dashboard';
  }

  if (r === 'coo') {
    return '/operations/dashboard';
  }

  if (r === 'estateofficer' || r === 'estate officer') {
    return '/operations/esm';
  }

  if (r === 'labadmin' || r === 'lab admin') {
    return '/labs/dashboard';
  }

  if (r === 'procurement' || r === 'procurementbuyer') {
    return '/finance/procurement';
  }

  if (r === 'procurementhead') {
    return '/finance/procurement';
  }

  if (r === 'stores' || r === 'receivingclerk') {
    return '/finance/grn';
  }

  if (r === 'legalofficer' || r === 'legal officer') {
    return '/leadership/mou-approvals';
  }

  if (r === 'deanofresearch' || r === 'dean of research') {
    return '/research/grants';
  }

  if (r === 'competitionadmin' || r === 'competition admin') {
    return '/competitions/dashboard';
  }

  if (r === 'pop' || r === 'professor of practice') {
    return '/special-programs/pop';
  }

  if (r === 'wrangler') {
    return '/incubation/mentors';
  }

  if (r === 'transportofficer' || r === 'transport officer') {
    return '/admin-ops/fleet';
  }

  if (r === 'campusadmin') {
    return campusAdminRoutes.dashboard;
  }

  if (r === 'superadmin') {
    return '/super-admin/dashboard';
  }

  if (r === 'registrar') {
    return '/admin/dashboard';
  }

  if (r.includes('admission')) {
    return '/admissions-crm/pipeline';
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
  if (r === 'accountant' || r === 'cfo' || r === 'apmanager' || r === 'apclerk') return 'Finance Workspace';
  if (r === 'internalauditor') return 'Internal Audit';
  if (r === 'iqac') return 'IQAC Workspace';
  if (r === 'librarian') return 'Library Workspace';
  if (r === 'president') return 'Executive Workspace';
  if (r === 'chairman') return 'Executive Command Center';
  if (r === 'parent') return 'Parent Workspace';
  if (r === 'alumni') return 'Alumni Network';
  if (r === 'examcell' || r === 'exam cell') return 'Exam Cell Workspace';
  if (r === 'dc_member' || r === 'dc member') return 'Disciplinary Committee';
  if (r === 'incubation_admin' || r === 'ecelladmin' || r === 'fellowshipadmin') return 'Incubation';
  if (r === 'coo') return 'COO Operations';
  if (r === 'estateofficer') return 'Estate Operations';
  if (r === 'labadmin') return 'Tokamak Labs';
  if (r === 'procurement' || r === 'procurementbuyer') return 'Central Procurement';
  if (r === 'procurementhead') return 'Procurement Head';
  if (r === 'stores' || r === 'receivingclerk') return 'Central Stores';
  if (r === 'competitionadmin') return 'Tokamak Challenges';
  if (r === 'pop') return 'Special Programs';
  if (r === 'wrangler') return 'Wrangler Mentorship';
  if (r === 'campusadmin') return 'Campus Admin Workspace';
  if (r === 'superadmin') return 'Super Admin Workspace';
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
  if (r === 'campusadmin') return 'Campus Admin';
  if (r === 'superadmin') return 'Super Admin';
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
  '/finance': [
    'accountant',
    'superadmin',
    'coo',
    'cfo',
    'apmanager',
    'apclerk',
    'financecontroller',
    'procurement',
    'procurementhead',
    'procurementbuyer',
    'stores',
    'security',
    'receivingclerk',
    'internalauditor',
  ],
  '/approvals': [
    'superadmin',
    'campusadmin',
    'chairman',
    'president',
    'coo',
    'cfo',
    'dean',
    'hod',
    'hr',
    'hradmin',
    'examcell',
    'examadmin',
    'deputycoe',
    'faculty',
    'labadmin',
    'accountant',
    'apmanager',
    'apclerk',
    'financecontroller',
    'estateofficer',
    'security',
    'legalofficer',
    'procurementhead',
    'procurement',
    'procurementbuyer',
    'stores',
    'receivingclerk',
    'internalauditor',
  ],
  '/iqac': ['iqac', 'superadmin', 'registrar', 'president'],
  '/library': ['librarian', 'superadmin'],
  '/library-admin': ['librarian', 'superadmin'],
  '/president': ['president', 'vice chancellor', 'superadmin'],
  '/leadership': [
    'chairman',
    'president',
    'vice chancellor',
    'superadmin',
    'registrar',
    'cfo',
    'coo',
    'internalauditor',
  ],
  '/parent': ['parent', 'superadmin'],
  '/exam-cell': ['examcell', 'superadmin', 'deputycoe', 'examadmin', 'examoperator'],
  '/disciplinary-committee': ['dc_member', 'superadmin'],
  '/alumni': ['alumni'],
  '/alumni-admin': ['iqac', 'superadmin', 'campusadmin', 'registrar', 'president'],
  '/admin-ops': ['registrar', 'superadmin', 'campusadmin', 'transportofficer', 'labadmin'],
  '/placements': ['placementcell', 'superadmin', 'campusadmin', 'registrar'],
  '/incubation': ['incubation_admin', 'ecelladmin', 'fellowshipadmin', 'wrangler', 'superadmin', 'campusadmin', 'hod', 'dean', 'president'],
  '/ecell-admin': ['incubation_admin', 'ecelladmin', 'superadmin', 'campusadmin'],
  '/labs': ['labadmin', 'superadmin', 'campusadmin', 'coo', 'wrangler'],
  '/competitions': ['competitionadmin', 'superadmin', 'campusadmin', 'coo', 'incubation_admin'],
  '/operations': [
    'coo',
    'estateofficer',
    'superadmin',
    'campusadmin',
    'chairman',
    'president',
    'cfo',
    'helpdeskdispatcher',
    'internalauditor',
  ],
  '/special-programs': ['pop', 'dean', 'registrar', 'superadmin', 'campusadmin', 'hr', 'hradmin'],
  '/documents': ['student', 'faculty', 'registrar', 'superadmin', 'campusadmin', 'parent'],
  '/reports': ['registrar', 'superadmin', 'campusadmin', 'president', 'accountant'],
  '/admin': ['superadmin', 'campusadmin', 'registrar'],
  '/campus-admin': ['campusadmin', 'admissionsofficer'],
  '/super-admin': ['superadmin'],
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
  '/tickets': ['student', 'faculty', 'hod', 'dean', 'hr', 'hradmin', 'superadmin', 'campusadmin', 'registrar', 'parent', 'coo', 'estateofficer'],
  '/research': ['iqac', 'faculty', 'hod', 'dean', 'deanofresearch', 'chairman', 'superadmin', 'campusadmin', 'drc_member', 'rac_member', 'rrc_member', 'phd_adjudicator', 'labadmin', 'wrangler'],
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

/**
 * DoFA Modules 1-9 + X share the Finance shell, but many valid actors are not
 * finance-office personas. Keep navigation visibility and route authorization
 * aligned so a role cannot be shown a module that RoleGate then rejects.
 */
export const DOFA_FINANCE_MODULE_PATH_ROLES: Readonly<
  Record<string, readonly string[]>
> = {
  '/finance/acquisitions': [
    'labadmin', 'hod', 'dean', 'faculty', 'procurement', 'procurementhead',
    'procurementbuyer', 'accountant', 'financecontroller', 'cfo', 'coo',
    'internalauditor', 'superadmin', 'campusadmin',
  ],
  '/finance/procurements': [
    'labadmin', 'hod', 'faculty', 'procurement', 'procurementhead',
    'procurementbuyer', 'stores', 'receivingclerk', 'apclerk', 'apmanager',
    'accountant', 'financecontroller', 'cfo', 'internalauditor', 'superadmin',
    'campusadmin',
  ],
  '/finance/invoice-integrity': [
    'apclerk', 'apmanager', 'accountant', 'financecontroller', 'cfo',
    'internalauditor', 'tenantadmin', 'superadmin', 'campusadmin',
  ],
  '/finance/product-verification': [
    'stores', 'receivingclerk', 'procurementhead', 'internalauditor',
    'tenantadmin', 'superadmin',
  ],
  '/finance/inventory': [
    'stores', 'receivingclerk', 'inventoryverifier', 'procurementhead',
    'internalauditor', 'tenantadmin', 'superadmin',
  ],
  '/finance/physical-identity': [
    'stores', 'security', 'inventoryverifier', 'procurementhead',
    'internalauditor', 'tenantadmin', 'superadmin',
  ],
  '/finance/consumables': [
    'faculty', 'labadmin', 'stores', 'procurementhead', 'internalauditor',
    'tenantadmin', 'superadmin',
  ],
  '/finance/returns': [
    'faculty', 'labadmin', 'stores', 'procurementhead', 'finance',
    'financecontroller', 'cfo', 'internalauditor', 'tenantadmin', 'superadmin',
  ],
  '/finance/asset-service': [
    'faculty', 'labadmin', 'stores', 'procurementhead', 'finance',
    'financecontroller', 'cfo', 'servicetechnician', 'externalserviceprovider',
    'internalauditor', 'tenantadmin', 'superadmin',
  ],
  '/finance/asset-retirement': [
    'faculty', 'labadmin', 'stores', 'procurementhead', 'finance',
    'financecontroller', 'cfo', 'sanitizationoperator', 'sanitizationverifier',
    'internalauditor', 'tenantadmin', 'superadmin',
  ],
};

export function getDofaFinanceModuleAccess(
  roleOrRoles: string | string[] | undefined | null,
  pathname: string,
): boolean | null {
  const match = Object.keys(DOFA_FINANCE_MODULE_PATH_ROLES)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!match) return null;

  const roles = (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles])
    .filter((role): role is string => Boolean(role))
    .map((role) => role.trim().toLowerCase());
  return roles.some((role) => DOFA_FINANCE_MODULE_PATH_ROLES[match].includes(role));
}

/** Full finance desk — receivables, payables settlement, core accounting */
export const FINANCE_DESK_ROLE_NAMES = [
  'Accountant',
  'CFO',
  'APManager',
  'APClerk',
  'FinanceController',
  'SuperAdmin',
  'CampusAdmin',
] as const;

const FINANCE_DESK_ROLE_SET = new Set(FINANCE_DESK_ROLE_NAMES.map((r) => r.toLowerCase()));

const PROCUREMENT_BUYER_FINANCE_PATHS = [
  '/finance/procurement',
  '/finance/catalog',
  '/finance/purchase-orders',
] as const;

const PROCUREMENT_HEAD_EXTRA_FINANCE_PATHS = [
  '/finance/approvals',
  '/finance/procurement-intelligence',
  '/finance/dofa',
  '/finance/vendors',
] as const;

const STORES_FINANCE_PATHS = ['/finance/grn'] as const;

const INTERNAL_AUDITOR_FINANCE_PATHS = [
  '/finance/procurement-intelligence',
  '/finance/approvals/dofa-inbox',
] as const;

function matchesFinancePrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Password, contact, notifications — any role using the finance shell. */
function isFinanceAccountSelfServicePath(pathname: string): boolean {
  return (
    pathname === '/finance/settings' ||
    pathname.startsWith('/finance/settings/') ||
    pathname === '/finance/profile' ||
    pathname.startsWith('/finance/profile/')
  );
}

/** Whether this finance-office role may open this /finance/* path. */
export function isFinancePathAllowedForRole(
  role: string | undefined | null,
  pathname: string,
): boolean {
  if (!pathname.startsWith('/finance')) return true;

  if (isFinanceAccountSelfServicePath(pathname)) {
    const r = (role ?? '').trim().toLowerCase();
    return (
      FINANCE_DESK_ROLE_SET.has(r) ||
      r === 'cfo' ||
      r === 'coo' ||
      r === 'procurement' ||
      r === 'procurementhead' ||
      r === 'procurementbuyer' ||
      r === 'stores' ||
      r === 'security' ||
      r === 'receivingclerk' ||
      r === 'internalauditor'
    );
  }

  const r = (role ?? '').trim().toLowerCase();
  if (FINANCE_DESK_ROLE_SET.has(r) || r === 'cfo' || r === 'coo') return true;

  if (r === 'internalauditor') {
    return matchesFinancePrefix(pathname, INTERNAL_AUDITOR_FINANCE_PATHS);
  }

  if (r === 'procurementhead') {
    return matchesFinancePrefix(pathname, [
      ...PROCUREMENT_BUYER_FINANCE_PATHS,
      ...PROCUREMENT_HEAD_EXTRA_FINANCE_PATHS,
    ]);
  }

  if (r === 'procurement' || r === 'procurementbuyer') {
    return matchesFinancePrefix(pathname, PROCUREMENT_BUYER_FINANCE_PATHS);
  }

  if (r === 'stores' || r === 'security' || r === 'receivingclerk') {
    return matchesFinancePrefix(pathname, STORES_FINANCE_PATHS);
  }

  return true;
}

/** Module 2 P2P — granular finance paths (requestors are not full Finance users). */
const FINANCE_P2P_PATH_ROLES: Record<string, string[]> = {
  '/finance/requisitions': [
    'labadmin',
    'hod',
    'faculty',
    'warden',
    'estateofficer',
    'superadmin',
    'campusadmin',
  ],
  '/finance/procurement': [
    'procurement',
    'procurementhead',
    'procurementbuyer',
    'superadmin',
    'campusadmin',
  ],
  '/finance/catalog': [
    'procurement',
    'procurementhead',
    'procurementbuyer',
    'labadmin',
    'hod',
    'faculty',
    'superadmin',
    'campusadmin',
  ],
  '/finance/grn': ['stores', 'security', 'receivingclerk', 'superadmin', 'campusadmin'],
  '/finance/ap-desk': [
    'apmanager',
    'apclerk',
    'cfo',
    'accountant',
    'financecontroller',
    'superadmin',
    'campusadmin',
  ],
  '/finance/approvals': [
    'hod',
    'dean',
    'procurementhead',
    'financecontroller',
    'cfo',
    'coo',
    'chairman',
    'president',
    'superadmin',
    'campusadmin',
  ],
  '/finance/procurement-intelligence': [
    'coo',
    'cfo',
    'internalauditor',
    'procurementhead',
    'chairman',
    'superadmin',
    'campusadmin',
  ],
  '/finance/dofa': [
    'coo',
    'cfo',
    'accountant',
    'financecontroller',
    'procurementhead',
    'chairman',
    'superadmin',
    'campusadmin',
    'hod',
    'dean',
  ],
};

function canAccessFinanceP2pPath(roles: string[], pathname: string): boolean | null {
  const match = Object.keys(FINANCE_P2P_PATH_ROLES)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!match) return null;
  return roles.some((role) => FINANCE_P2P_PATH_ROLES[match].includes(role));
}

export function canRoleAccessPath(
  roleOrRoles: string | string[] | undefined | null,
  pathname: string,
  hrCapabilities?: HrCapabilities | null,
  permissions?: string[],
  email?: string,
): boolean {
  const rawRoles = (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles])
    .filter((role): role is string => Boolean(role))
    .map((role) => role.trim().toLowerCase());
  const roles = expandCampusAdminRoles(rawRoles);

  if (
    pathname === '/campus-admin/entities' ||
    pathname.startsWith('/campus-admin/entities/') ||
    pathname === '/super-admin/entities' ||
    pathname.startsWith('/super-admin/entities/')
  ) {
    return (
      rawRoles.includes('superadmin') &&
      (email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL
    );
  }

  // Keep Super Admin and Campus Admin portals as separate workspaces (do not
  // let expandCampusAdminRoles cross-admit users across these two prefixes).
  if (pathname === '/super-admin' || pathname.startsWith('/super-admin/')) {
    return rawRoles.includes('superadmin');
  }
  if (pathname === '/campus-admin' || pathname.startsWith('/campus-admin/')) {
    if (
      pathname === '/campus-admin/impersonation' ||
      pathname.startsWith('/campus-admin/impersonation/') ||
      pathname === '/campus-admin/settings' ||
      pathname.startsWith('/campus-admin/settings/') ||
      pathname === '/campus-admin/entities' ||
      pathname.startsWith('/campus-admin/entities/') ||
      pathname === '/campus-admin/override-logs' ||
      pathname.startsWith('/campus-admin/override-logs/')
    ) {
      return false;
    }
    if (rawRoles.includes('admissionsofficer') && !rawRoles.includes('campusadmin')) {
      return (
        pathname === '/campus-admin/dashboard' ||
        pathname.startsWith('/campus-admin/admissions/') ||
        pathname === '/campus-admin/my-leave' ||
        pathname.startsWith('/campus-admin/account/')
      );
    }
    return rawRoles.includes('campusadmin');
  }

  if (
    pathname === '/admin/dofa-policy-vault' ||
    pathname.startsWith('/admin/dofa-policy-vault/')
  ) {
    if (rawRoles.includes('campusadmin') && !rawRoles.includes('superadmin')) {
      return false;
    }
  }

  if (
    pathname === '/admin/departments' ||
    pathname.startsWith('/admin/departments/')
  ) {
    if (
      rawRoles.includes('campusadmin') &&
      !rawRoles.includes('registrar') &&
      !rawRoles.includes('superadmin')
    ) {
      return false;
    }
    return rawRoles.includes('registrar') || rawRoles.includes('superadmin');
  }

  if (
    pathname === '/admin/users' ||
    pathname.startsWith('/admin/users/') ||
    pathname === '/admin/communication' ||
    pathname.startsWith('/admin/communication/') ||
    pathname === '/admin/audit-logs' ||
    pathname.startsWith('/admin/audit-logs/')
  ) {
    if (
      rawRoles.includes('campusadmin') &&
      !rawRoles.includes('registrar') &&
      !rawRoles.includes('superadmin')
    ) {
      return false;
    }
    return rawRoles.includes('registrar') || rawRoles.includes('superadmin');
  }

  if (pathname === '/directory' || pathname === '/directory/') {
    return roles.some((role) =>
      ['chairman', 'president', 'superadmin', 'campusadmin', 'registrar', 'hradmin', 'hr', 'hod', 'dean', 'warden', 'faculty'].includes(role),
    );
  }

  if (isPathHiddenForLaunch(pathname)) {
    return false;
  }

  const dofaModuleAccess = getDofaFinanceModuleAccess(roles, pathname);
  if (dofaModuleAccess !== null) {
    return dofaModuleAccess;
  }

  if (
    pathname === '/leadership/mou-approvals' ||
    pathname.startsWith('/leadership/mou-approvals/')
  ) {
    return roles.some((role) =>
      ['chairman', 'president', 'vice chancellor', 'superadmin', 'registrar', 'cfo', 'coo', 'legalofficer'].includes(role),
    );
  }

  const p2pAccess = canAccessFinanceP2pPath(roles, pathname);
  if (p2pAccess !== null) {
    return p2pAccess;
  }

  if (pathname.startsWith('/finance')) {
    if (!roles.some((role) => isFinancePathAllowedForRole(role, pathname))) {
      return false;
    }
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
  // (Finance, HR, IQAC, Operations, Settings). CampusAdmin/SuperAdmin keep access.
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
  '/super-admin': '/super-admin/account/settings',
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
