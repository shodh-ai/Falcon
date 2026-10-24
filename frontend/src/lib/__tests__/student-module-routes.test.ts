import { describe, expect, it } from 'vitest';
import { filterPortalConfigForLaunchModules, resolvePathModule, runtimeModuleForPath, type BusinessModuleKey, type RuntimeModuleManifest } from '@/lib/launch-modules';

const routes: [BusinessModuleKey, string[]][] = [
  ['admissions_onboarding', ['/student/admission-vault', '/student/onboarding/step-1', '/student/onboarding/step-2', '/student/onboarding/step-3']],
  ['sis_academics', ['/student/academics', '/student/registration', '/student/timetable', '/student/academic-calendar', '/student/attendance', '/student/mentorship', '/student/policies']],
  ['lms_learning', ['/student/courses', '/student/courses/id', '/student/weekly-tests', '/student/weekly-tests/attempt/id']],
  ['examinations_credentials', ['/student/marks', '/student/exams', '/student/transcripts', '/student/exit', '/student/certificates', '/student/profile/certificates']],
  ['finance_procurement', ['/student/finance', '/student/fees']],
  ['library', ['/student/library', '/student/library/book']],
  ['hostel_mess', ['/student/campus-life', '/student/hostel', '/student/hostel/tatkal', '/student/hostel-booking', '/student/hostel-booking/checkout', '/student/mess', '/student/dining', '/student/gate-pass']],
  ['transport', ['/student/transport']],
  ['helpdesk_esm', ['/student/helpdesk', '/student/helpdesk/ticket']],
  ['research_innovation', ['/student/e-cell', '/student/research', '/student/phd', '/student/challenges', '/student/portfolio', '/student/wetware']],
  ['placements_alumni', ['/student/placements']],
  ['clinic_safety', ['/student/safety-concerns']],
  ['campus_operations', ['/student/events', '/student/events/checkout', '/student/falcon-events', '/student/clubs-chapters', '/student/club-management', '/student/extracurriculars', '/student/venues']],
];

describe('Student module route coverage', () => {
  for (const [moduleKey, paths] of routes) {
    it.each(paths)(`gates ${moduleKey}: %s including query/hash links`, (path) => {
      const href = `${path}?tab=details#section`;
      const manifest: RuntimeModuleManifest = {
        revision: 'test', generatedAt: '', cacheSeconds: 30,
        modules: [{ moduleKey, displayName: moduleKey, available: false, state: 'OFF', revision: 1, sourceScope: 'TENANT', updatedAt: null }],
      };
      expect(resolvePathModule(href)).toBe(moduleKey);
      expect(runtimeModuleForPath(manifest, path)?.available).toBe(false);
      const config = { navGroups: [{ items: [{ href }] }], commandItems: [{ href }], mobileNavItems: [{ href }] };
      expect(filterPortalConfigForLaunchModules(config, manifest)).toEqual({ navGroups: [], commandItems: [], mobileNavItems: [] });
    });
  }

  it.each(['/student', '/student/dashboard', '/student/profile', '/student/settings', '/student/ai-assistant'])('keeps Student infrastructure reachable: %s', (path) => {
    expect(resolvePathModule(path)).toBeUndefined();
  });

  it('preserves nonstudent route ownership and exact prefix boundaries', () => {
    expect(resolvePathModule('/faculty/courses/a')).toBe('lms_learning');
    expect(resolvePathModule('/faculty/library/a')).toBe('library');
    expect(resolvePathModule('/finance/inventory/a')).toBe('inventory_assets');
    expect(resolvePathModule('/operations/esm')).toBe('helpdesk_esm');
    expect(resolvePathModule('/research/rac/reviews')).toBe('research_innovation');
    expect(resolvePathModule('/student/marks-extra')).toBeUndefined();
  });
});
