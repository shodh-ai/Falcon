export const MODULE_STATES = [
  'OFF',
  'SHADOW',
  'PILOT',
  'ACTIVE',
  'DRAINING',
  'PAUSED',
] as const;

export type ModuleState = (typeof MODULE_STATES)[number];

export const MODULE_KEYS = [
  'admissions_onboarding',
  'sis_academics',
  'examinations_credentials',
  'hrms_ess',
  'finance_procurement',
  'inventory_assets',
  'library',
  'hostel_mess',
  'transport',
  'helpdesk_esm',
  'research_innovation',
  'placements_alumni',
  'iqac_compliance',
  'clinic_safety',
  'campus_operations',
  'leadership_reporting',
] as const;

export type BusinessModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleKey = BusinessModuleKey | 'CORE';
export type DependencyKind =
  | 'REQUIRED_AT_ENTRY'
  | 'REQUIRED_AT_STEP'
  | 'OPTIONAL_ENRICHMENT'
  | 'READ_ONLY_PROJECTION';

export type ModuleDefinition = {
  moduleKey: BusinessModuleKey;
  displayName: string;
  version: string;
  businessOwnerRoles: string[];
  routePrefixes: string[];
  apiPrefixes: string[];
  capabilities: string[];
  workers: string[];
  requiredConfiguration: string[];
  dependencyEdges: Array<{
    moduleKey: BusinessModuleKey;
    kind: DependencyKind;
  }>;
  legacyFallbackPolicy: 'NONE' | 'EXPLICIT_ONLY';
  healthChecks: string[];
};

const definition = (
  moduleKey: BusinessModuleKey,
  displayName: string,
  routePrefixes: string[],
  apiPrefixes: string[],
  businessOwnerRoles: string[],
  dependencyEdges: ModuleDefinition['dependencyEdges'] = [],
): ModuleDefinition => ({
  moduleKey,
  displayName,
  version: '1.0.0',
  businessOwnerRoles,
  routePrefixes,
  apiPrefixes,
  capabilities: [],
  workers: [],
  requiredConfiguration: [],
  dependencyEdges,
  legacyFallbackPolicy: 'EXPLICIT_ONLY',
  healthChecks: ['schema', 'permissions', 'workers', 'smoke'],
});

export const MODULE_CATALOGUE: readonly ModuleDefinition[] = [
  definition(
    'admissions_onboarding',
    'Admissions & Onboarding',
    [
      '/admissions-crm',
      '/admissions',
      '/student/onboarding',
      '/student/admission-vault',
    ],
    [
      '/api/admissions-crm',
      '/api/student/onboarding',
      '/api/admin/student-verifications',
      '/admissions',
    ],
    ['AdmissionsHead', 'Registrar'],
  ),
  definition(
    'sis_academics',
    'SIS / Academics',
    ['/academics', '/student/academics', '/faculty', '/lms'],
    [
      '/api/academics',
      '/api/lms',
      '/api/weekly-tests',
      '/api/faculty-ai',
      '/api/student',
      '/api/parent',
      '/api/admin/registrar',
      '/api/admin/registrar-desk',
    ],
    ['Registrar', 'Dean'],
  ),
  definition(
    'examinations_credentials',
    'Examinations & Credentials',
    ['/exam-cell', '/exams', '/student/exams', '/certificates'],
    [
      '/api/exam-cell',
      '/api/academics/exams',
      '/api/certificate-automation',
      '/api/verify',
    ],
    ['ControllerOfExaminations', 'Registrar'],
    [{ moduleKey: 'sis_academics', kind: 'REQUIRED_AT_ENTRY' }],
  ),
  definition(
    'hrms_ess',
    'HRMS & Employee Self-Service',
    ['/hr', '/employee', '/staff'],
    ['/api/hr', '/api/staff/onboarding', '/api/attendance-policy'],
    ['HRHead', 'Registrar'],
  ),
  definition(
    'finance_procurement',
    'Finance, Procurement & P2P',
    [
      '/finance',
      '/student/finance',
      '/student/fees',
      '/parent/finance',
      '/parent/fees',
      '/hod/funding-approvals',
    ],
    [
      '/api/finance',
      '/api/acquisitions/v1',
      '/api/procurements/v1',
      '/api/invoice-integrity/v1',
      '/api/campus-wallet',
      '/api/wallet',
    ],
    ['CFO', 'FinanceController', 'ProcurementHead'],
  ),
  definition(
    'inventory_assets',
    'Inventory & Asset Lifecycle',
    [
      '/finance/inventory',
      '/finance/product-verification',
      '/finance/consumables',
      '/finance/returns',
      '/finance/asset-service',
      '/finance/asset-retirement',
      '/finance/physical-identity',
      '/inventory',
      '/product-verification',
      '/asset-service',
      '/asset-retirement',
      '/physical-identity',
      '/consumables',
    ],
    [
      '/api/inventory/v1',
      '/api/product-verification/v1',
      '/api/consumables/v1',
      '/api/asset-service/v1',
      '/api/asset-retirement/v1',
      '/api/physical-identity/v1',
      '/api/returns/v1',
    ],
    ['InventoryManager', 'ProcurementHead'],
    [{ moduleKey: 'finance_procurement', kind: 'REQUIRED_AT_STEP' }],
  ),
  definition(
    'library',
    'Library',
    ['/library', '/library-admin', '/student/library', '/faculty/library'],
    ['/api/library', '/api/library-admin'],
    ['Librarian'],
  ),
  definition(
    'hostel_mess',
    'Hostel & Mess',
    ['/hostel', '/mess'],
    [
      '/api/hostel-admin',
      '/api/hostel-tatkal',
      '/api/mess',
      '/api/operations/hostel',
    ],
    ['HostelWarden', 'COO'],
  ),
  definition(
    'transport',
    'Transport',
    ['/transport'],
    ['/api/transport'],
    ['TransportManager', 'COO'],
  ),
  definition(
    'helpdesk_esm',
    'Helpdesk / ESM',
    ['/helpdesk', '/esm'],
    ['/api/helpdesk', '/api/operations/esm'],
    ['HelpdeskManager', 'COO'],
  ),
  definition(
    'research_innovation',
    'Research, PhD & Innovation',
    ['/research', '/phd', '/academic-rnd'],
    [
      '/api/research',
      '/api/phd-lifecycle',
      '/api/academic-rnd',
      '/api/moonshots',
      '/api/ecell',
      '/api/competitions',
      '/api/special-programs',
    ],
    ['ResearchDean', 'Dean'],
  ),
  definition(
    'placements_alumni',
    'Placements & Alumni',
    ['/placement', '/placements', '/alumni'],
    ['/api/placement', '/api/alumni', '/api/alumni-admin'],
    ['PlacementHead', 'AlumniHead'],
  ),
  definition(
    'iqac_compliance',
    'IQAC & Compliance',
    ['/iqac', '/compliance'],
    ['/api/iqac', '/api/uos', '/iqac'],
    ['IQACDirector'],
  ),
  definition(
    'clinic_safety',
    'Clinic, Health & Safety',
    ['/clinic', '/student-safety', '/safety'],
    ['/api/clinic', '/api/student-safety', '/api/demerits'],
    ['MedicalOfficer', 'COO'],
  ),
  definition(
    'campus_operations',
    'Campus Operations',
    ['/operations', '/labs', '/venues', '/campus-events'],
    [
      '/api/operations',
      '/api/labs',
      '/api/venue-bookings',
      '/api/campus-events',
      '/api/admin-ops',
      '/api/coo-ops',
      '/api/meetings',
      '/operations',
    ],
    ['COO'],
  ),
  definition(
    'leadership_reporting',
    'Leadership, Analytics & Reporting',
    ['/leadership', '/president', '/reports'],
    ['/api/leadership', '/api/president', '/api/reports'],
    ['President', 'COO'],
  ),
] as const;

export const CORE_API_PREFIXES = [
  '/api/auth',
  '/auth',
  '/api/tenants',
  '/api/master-data',
  '/api/platform',
  '/api/system',
  '/api/super-admin',
  '/api/campus-admin',
  '/api/settings',
  '/api/dofa',
  '/api/uploads',
  '/api/search',
  '/api/notifications',
  '/api/iam',
  '/api/admin-control',
  '/api/integrations',
  '/api/tasks',
  '/api/handover',
  '/iam',
  '/settings',
  '/scheduler',
  '/tasks',
  '/handover',
];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function resolveApiModule(path: string): ModuleKey | undefined {
  if (CORE_API_PREFIXES.some((prefix) => matchesPrefix(path, prefix)))
    return 'CORE';
  return [...MODULE_CATALOGUE]
    .flatMap((item) =>
      item.apiPrefixes.map((prefix) => ({ key: item.moduleKey, prefix })),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(({ prefix }) => matchesPrefix(path, prefix))?.key;
}
