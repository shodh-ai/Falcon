import {
  CORE_API_PREFIXES,
  MODULE_CATALOGUE,
  MODULE_KEYS,
  resolveApiModule,
} from './module-catalog';

describe('module catalogue', () => {
  it('defines every launchable suite exactly once', () => {
    expect(MODULE_CATALOGUE.map((item) => item.moduleKey).sort()).toEqual(
      [...MODULE_KEYS].sort(),
    );
    expect(new Set(MODULE_CATALOGUE.map((item) => item.moduleKey)).size).toBe(
      MODULE_KEYS.length,
    );
  });

  it('uses longest-prefix ownership for nested inventory routes', () => {
    expect(resolveApiModule('/api/product-verification/v1/cases')).toBe(
      'inventory_assets',
    );
    expect(resolveApiModule('/api/procurements/v1/cases')).toBe(
      'finance_procurement',
    );
    expect(resolveApiModule('/api/academics/hod/funding-requests')).toBe(
      'finance_procurement',
    );
    expect(resolveApiModule('/api/operations/esm/queues')).toBe('helpdesk_esm');
    expect(resolveApiModule('/api/operations/hostel/rooms')).toBe(
      'hostel_mess',
    );
  });

  it('owns LMS APIs independently from SIS APIs', () => {
    expect(resolveApiModule('/api/lms/courses/a/forums')).toBe('lms_learning');
    expect(resolveApiModule('/api/academics/faculty/courses/a/workspace')).toBe(
      'lms_learning',
    );
    expect(resolveApiModule('/api/academics/calendar')).toBe('sis_academics');
  });

  it.each([
    ['/api/student/profile/photo', 'CORE'],
    ['/api/student/profile/update-request', 'CORE'],
    ['/api/student/campus-settings', 'CORE'],
    ['/api/student/portal-bootstrap', 'sis_academics'],
    ['/api/academics/marks/history', 'examinations_credentials'],
    ['/api/academics/marksheet/download/1', 'examinations_credentials'],
    ['/api/student/admission-vault', 'admissions_onboarding'],
    ['/api/student/admission-documents', 'admissions_onboarding'],
    ['/api/student/documents', 'admissions_onboarding'],
    ['/api/student/attendance', 'sis_academics'],
    ['/api/student/exam-desk', 'examinations_credentials'],
    ['/api/student/marks', 'examinations_credentials'],
    ['/api/student/transcripts', 'examinations_credentials'],
    ['/api/student/exit', 'examinations_credentials'],
    ['/api/student/exit/alumni-register', 'placements_alumni'],
    ['/api/student/finance/pay/order', 'finance_procurement'],
    ['/api/student/library', 'library'],
    ['/api/student/transport', 'transport'],
    ['/api/student/placements', 'placements_alumni'],
    ['/api/student/mentorship/alumni', 'placements_alumni'],
    ['/api/student/discipline', 'clinic_safety'],
    ['/api/student/extracurriculars', 'campus_operations'],
  ])('routes student API %s through its owning module %s', (path, module) => {
    expect(resolveApiModule(path)).toBe(module);
  });

  it('does not overlap API prefixes across business modules', () => {
    const prefixes = MODULE_CATALOGUE.flatMap((item) =>
      item.apiPrefixes.map((prefix) => `${prefix}:${item.moduleKey}`),
    );
    expect(new Set(prefixes.map((item) => item.split(':')[0])).size).toBe(
      prefixes.length,
    );
    expect(
      CORE_API_PREFIXES.every((prefix) => resolveApiModule(prefix) === 'CORE'),
    ).toBe(true);
  });

  it('requires every inventory lifecycle signing authority before launch', () => {
    const inventory = MODULE_CATALOGUE.find(
      (module) => module.moduleKey === 'inventory_assets',
    );
    expect(inventory?.requiredConfiguration).toEqual(
      expect.arrayContaining([
        'PRODUCT_VERIFICATION_ED25519_PRIVATE_KEY',
        'PRODUCT_VERIFICATION_SIGNING_KEY_VERSION',
        'INVENTORY_ED25519_PRIVATE_KEY',
        'INVENTORY_SIGNING_KEY_VERSION',
        'ASSET_RETIREMENT_ED25519_PRIVATE_KEY',
        'ASSET_RETIREMENT_SIGNING_KEY_VERSION',
      ]),
    );
  });
});
