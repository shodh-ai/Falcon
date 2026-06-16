export type OnboardingPortalKind = 'student' | 'staff';

export type PortalOnboardingConfig = {
  portalPrefix: '/student' | '/faculty' | '/hod';
  apiPrefix: '/api/student/onboarding' | '/api/staff/onboarding';
  portalLabel: string;
  dashboardPath: string;
  kind: OnboardingPortalKind;
};

export const STUDENT_ONBOARDING_CONFIG: PortalOnboardingConfig = {
  portalPrefix: '/student',
  apiPrefix: '/api/student/onboarding',
  portalLabel: 'Student',
  dashboardPath: '/student/dashboard',
  kind: 'student',
};

export const FACULTY_ONBOARDING_CONFIG: PortalOnboardingConfig = {
  portalPrefix: '/faculty',
  apiPrefix: '/api/staff/onboarding',
  portalLabel: 'Faculty',
  dashboardPath: '/faculty/dashboard',
  kind: 'staff',
};

export const HOD_ONBOARDING_CONFIG: PortalOnboardingConfig = {
  portalPrefix: '/hod',
  apiPrefix: '/api/staff/onboarding',
  portalLabel: 'HOD',
  dashboardPath: '/hod/dashboard',
  kind: 'staff',
};

export const STAFF_DOC_LABELS: Record<string, string> = {
  PHOTO: 'Passport Size Photo',
  AADHAAR: 'Aadhaar Card',
  PAN: 'PAN Card',
  HIGHEST_DEGREE: 'Highest Degree Certificate',
};

export const STAFF_DEGREE_LEVELS = ['UG', 'PG', 'PhD', 'Post-Doc'] as const;

export const STUDENT_DOC_LABELS: Record<string, string> = {
  PHOTO: 'Passport Size Photo',
  AADHAAR: 'Aadhaar Card',
  '10TH_MARKSHEET': '10th Marksheet',
  '12TH_MARKSHEET': '12th Marksheet',
};

export function getOnboardingStepPath(
  portalPrefix: PortalOnboardingConfig['portalPrefix'],
  status: string | undefined | null,
): string | null {
  switch ((status ?? '').trim()) {
    case 'PENDING_PASSWORD_RESET':
      return `${portalPrefix}/onboarding/step-1`;
    case 'PENDING_DOCUMENTS':
      return `${portalPrefix}/onboarding/step-2`;
    case 'PENDING_ADMIN_APPROVAL':
      return `${portalPrefix}/onboarding/step-3`;
    default:
      return null;
  }
}

export function isFirstLoginOnboardingComplete(status: string | undefined | null): boolean {
  const value = (status ?? 'ACTIVE').trim();
  return value === 'COMPLETED' || value === 'ACTIVE';
}

export function isStaffOnboardingRole(role: string | undefined | null): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'faculty' || r === 'hod' || r === 'dean';
}

export function getStaffOnboardingConfig(role: string | undefined | null): PortalOnboardingConfig {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'hod' || r === 'dean') return HOD_ONBOARDING_CONFIG;
  return FACULTY_ONBOARDING_CONFIG;
}

export function getOnboardingConfigForRole(role: string | undefined | null): PortalOnboardingConfig | null {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return STUDENT_ONBOARDING_CONFIG;
  if (isStaffOnboardingRole(r)) return getStaffOnboardingConfig(r);
  return null;
}
