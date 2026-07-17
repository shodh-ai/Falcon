import {
  getDashboardPathForRoleName,
  getInitialOnboardingStatusForRole,
  getRequiredDocTypes,
  normalizeOnboardingStatusForWizard,
  requiresFirstLoginWizard,
  resolveOnboardingPortalKind,
} from '../../../backend/src/modules/student-onboarding/onboarding-portal.util';

describe('onboarding-portal.util', () => {
  it('requires first login wizard for faculty and student', () => {
    expect(requiresFirstLoginWizard('Faculty')).toBe(true);
    expect(requiresFirstLoginWizard('Student')).toBe(true);
    expect(requiresFirstLoginWizard('SuperAdmin')).toBe(false);
  });

  it('assigns initial onboarding status by role', () => {
    expect(getInitialOnboardingStatusForRole('Faculty')).toBe(
      'PENDING_PASSWORD_RESET',
    );
    expect(getInitialOnboardingStatusForRole('SuperAdmin')).toBe(
      'PENDING_ONBOARDING',
    );
  });

  it('normalizes legacy statuses for wizard roles', () => {
    expect(normalizeOnboardingStatusForWizard('IN_PROGRESS', 'Faculty')).toBe(
      'PENDING_DOCUMENTS',
    );
    expect(normalizeOnboardingStatusForWizard('', 'Faculty')).toBe(
      'PENDING_PASSWORD_RESET',
    );
  });

  it('resolves portal kind and doc types', () => {
    expect(resolveOnboardingPortalKind('HOD')).toBe('staff');
    expect(resolveOnboardingPortalKind('Student')).toBe('student');
    expect(getRequiredDocTypes('staff')).toContain('PAN');
    expect(getRequiredDocTypes('student')).toContain('AADHAAR');
  });

  it('maps dashboard paths by role', () => {
    expect(getDashboardPathForRoleName('Dean')).toBe('/dean/dashboard');
    expect(getDashboardPathForRoleName('unknown')).toBe('/dashboard');
  });
});
