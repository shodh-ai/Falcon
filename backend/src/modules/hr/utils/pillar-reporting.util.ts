/** Three-pillar reporting rules for Digital DOFA anti-collusion. */

export const FINANCE_PILLAR_ROLES = new Set([
  'CFO',
  'APManager',
  'APClerk',
  'Accountant',
  'FinanceController',
  'InternalAuditor',
]);

export const PROCUREMENT_ROLES = new Set([
  'Procurement',
  'ProcurementHead',
  'ProcurementBuyer',
]);

export const STORES_ROLES = new Set([
  'Stores',
  'Security',
  'ReceivingClerk',
]);

export const OPERATIONS_PILLAR_ROLES = new Set([
  'COO',
  ...PROCUREMENT_ROLES,
  ...STORES_ROLES,
  'EstateOfficer',
  'HelpdeskDispatcher',
]);

export type PillarRoleRow = {
  user_id: string;
  role_name: string | null;
  reporting_officer_id: string | null;
};

export type PillarViolation =
  | { code: 'FINANCE_REPORTS_TO_COO'; message: string }
  | { code: 'PROCUREMENT_STORES_SHARED_MANAGER'; message: string }
  | { code: 'PROCUREMENT_STORES_CROSS_REPORT'; message: string }
  | { code: 'AUDITOR_MUST_REPORT_TO_CHAIRMAN'; message: string }
  | { code: 'CROSS_PILLAR_DUAL_ROLE'; message: string };

export function pillarOfRole(roleName: string | null | undefined): 'ACADEMIC' | 'OPERATIONS' | 'FINANCE' | 'OTHER' {
  const r = String(roleName ?? '');
  if (FINANCE_PILLAR_ROLES.has(r)) return 'FINANCE';
  if (OPERATIONS_PILLAR_ROLES.has(r)) return 'OPERATIONS';
  if (['President', 'Dean', 'HOD', 'LabAdmin', 'Faculty', 'Warden'].includes(r)) {
    return 'ACADEMIC';
  }
  return 'OTHER';
}

/** Walk ancestors; return true if any has role COO. */
export function financeReportsToCoo(
  subjectRole: string,
  officerChainRoles: string[],
): boolean {
  if (!FINANCE_PILLAR_ROLES.has(subjectRole)) return false;
  return officerChainRoles.some((r) => r === 'COO');
}

export function procurementStoresShareManager(
  subjectRole: string,
  managerId: string | null,
  peersUnderSameManager: Array<{ role_name: string }>,
): boolean {
  if (!managerId) return false;
  if (PROCUREMENT_ROLES.has(subjectRole)) {
    return peersUnderSameManager.some((p) => STORES_ROLES.has(p.role_name));
  }
  if (STORES_ROLES.has(subjectRole)) {
    return peersUnderSameManager.some((p) => PROCUREMENT_ROLES.has(p.role_name));
  }
  return false;
}

export function procurementReportsToStoresOrViceVersa(
  subjectRole: string,
  officerRole: string | null,
): boolean {
  if (!officerRole) return false;
  if (PROCUREMENT_ROLES.has(subjectRole) && STORES_ROLES.has(officerRole)) return true;
  if (STORES_ROLES.has(subjectRole) && PROCUREMENT_ROLES.has(officerRole)) return true;
  return false;
}

export function auditorMustReportToChairman(
  subjectRole: string,
  officerRole: string | null,
): boolean {
  if (subjectRole !== 'InternalAuditor') return false;
  return officerRole !== 'Chairman' && officerRole !== 'President';
}

export function validatePillarReporting(input: {
  subjectRole: string;
  officerRole: string | null;
  officerChainRoles: string[];
  managerId: string | null;
  peersUnderSameManager: Array<{ role_name: string }>;
  existingPrimaryRoles?: string[];
}): PillarViolation | null {
  const {
    subjectRole,
    officerRole,
    officerChainRoles,
    managerId,
    peersUnderSameManager,
    existingPrimaryRoles = [],
  } = input;

  if (financeReportsToCoo(subjectRole, officerChainRoles)) {
    return {
      code: 'FINANCE_REPORTS_TO_COO',
      message: 'Finance pillar staff cannot report (directly or indirectly) to the COO',
    };
  }
  if (procurementReportsToStoresOrViceVersa(subjectRole, officerRole)) {
    return {
      code: 'PROCUREMENT_STORES_CROSS_REPORT',
      message: 'Procurement and Stores cannot report to each other',
    };
  }
  if (
    procurementStoresShareManager(subjectRole, managerId, peersUnderSameManager)
  ) {
    return {
      code: 'PROCUREMENT_STORES_SHARED_MANAGER',
      message: 'Procurement and Stores cannot share the same immediate manager',
    };
  }
  if (auditorMustReportToChairman(subjectRole, officerRole)) {
    return {
      code: 'AUDITOR_MUST_REPORT_TO_CHAIRMAN',
      message: 'Internal Auditor must report to the Chairman (or President)',
    };
  }

  const roles = new Set([subjectRole, ...existingPrimaryRoles]);
  const hasProc = [...roles].some((r) => PROCUREMENT_ROLES.has(r));
  const hasStores = [...roles].some((r) => STORES_ROLES.has(r));
  const hasFin = [...roles].some((r) => FINANCE_PILLAR_ROLES.has(r));
  const hasOpsLead = roles.has('COO');
  if (hasProc && hasStores) {
    return {
      code: 'CROSS_PILLAR_DUAL_ROLE',
      message: 'A user cannot hold both Procurement and Stores roles',
    };
  }
  if (hasFin && hasOpsLead) {
    return {
      code: 'CROSS_PILLAR_DUAL_ROLE',
      message: 'A user cannot be both Finance and COO',
    };
  }
  return null;
}
