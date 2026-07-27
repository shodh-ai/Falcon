/**
 * Role-scoped DOFA / P2P routes — keep approvers in their home portal shell.
 */
import { getActiveWorkspaceRoleFromPath, getDashboardPathForRole } from '@/lib/auth-routing';

const FINANCE_OFFICE_ROLES = new Set([
  'accountant',
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
]);

function norm(role: string | undefined | null): string {
  return (role ?? '').trim().toLowerCase();
}

export function isFinanceOfficeRole(role: string | undefined | null): boolean {
  const r = norm(role);
  return FINANCE_OFFICE_ROLES.has(r) || r === 'cfo' || r === 'coo';
}

export function getP2pDofaApprovalsPath(role: string | undefined | null): string {
  switch (norm(role)) {
    case 'hod':
      return '/hod/approvals/dofa';
    case 'dean':
      return '/dean/approvals/dofa';
    default:
      return '/finance/approvals';
  }
}

export function getUniversalDofaInboxPath(role: string | undefined | null): string {
  switch (norm(role)) {
    case 'hod':
      return '/hod/approvals/dofa-inbox';
    case 'dean':
      return '/dean/approvals/dofa-inbox';
    case 'examcell':
    case 'exam cell':
    case 'deputycoe':
    case 'examadmin':
      return '/exam-cell/approvals/dofa-inbox';
    case 'faculty':
      return '/faculty/approvals/dofa-inbox';
    case 'coo':
      return '/operations/approvals/dofa-inbox';
    case 'cfo':
      return '/finance/approvals/dofa-inbox';
    case 'hr':
    case 'hradmin':
      return '/hr/approvals/dofa-inbox';
    case 'chairman':
    case 'president':
      return '/leadership/exceptions';
    default:
      return '/approvals/dofa-inbox';
  }
}

const DOFA_INBOX_APPROVER_ROLES = [
  'coo',
  'cfo',
  'hod',
  'dean',
  'examcell',
  'exam cell',
  'faculty',
  'hr',
  'hradmin',
  'chairman',
  'president',
] as const;

/** Pick the best universal DOFA inbox for this user's approver hats. */
export function resolveDofaInboxPathForUser(
  userRoles: string[],
  pathname?: string | null,
): string | null {
  if (!userRoles.length) return null;

  const normalized = userRoles.map((r) => norm(r));
  const hasApproverRole = normalized.some((r) =>
    DOFA_INBOX_APPROVER_ROLES.includes(r as (typeof DOFA_INBOX_APPROVER_ROLES)[number]),
  );
  if (!hasApproverRole) return null;

  if (pathname) {
    const fromPath = getActiveWorkspaceRoleFromPath(pathname, userRoles);
    if (fromPath && getUniversalDofaInboxPath(fromPath) !== '/approvals/dofa-inbox') {
      return getUniversalDofaInboxPath(fromPath);
    }
  }

  for (const preferred of DOFA_INBOX_APPROVER_ROLES) {
    const match = userRoles.find((r) => norm(r) === preferred);
    if (match) return getUniversalDofaInboxPath(match);
  }

  return null;
}

export function getPurchaseRequisitionsPath(role: string | undefined | null): string {
  switch (norm(role)) {
    case 'hod':
      return '/hod/procurement/requisitions';
    case 'dean':
      return '/dean/procurement/requisitions';
    case 'labadmin':
    case 'lab admin':
      return '/labs/procurement/requisitions';
    default:
      return '/finance/requisitions';
  }
}

/** Redirect non-finance users away from /finance/* into their portal equivalents. */
export function getFinancePortalRedirect(
  role: string | undefined | null,
  pathname: string,
): string | null {
  if (!pathname.startsWith('/finance')) return null;
  if (isFinanceOfficeRole(role)) return null;

  const r = norm(role);
  if (pathname === '/finance/approvals' || pathname.startsWith('/finance/approvals/')) {
    const target = getP2pDofaApprovalsPath(r);
    return target === pathname ? null : target;
  }
  if (pathname === '/finance/requisitions' || pathname.startsWith('/finance/requisitions/')) {
    const target = getPurchaseRequisitionsPath(r);
    return target === pathname ? null : target;
  }
  if (['hod', 'dean', 'faculty', 'labadmin', 'lab admin'].includes(r)) {
    const dash = getDashboardPathForRole(r === 'lab admin' ? 'labadmin' : r);
    return dash === pathname ? null : dash;
  }
  return null;
}
