export type OnboardingPortalKind = 'student' | 'staff';

export type PortalOnboardingConfig = {
  portalPrefix: '/student' | '/faculty' | '/hod' | '/dean';
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

export const DEAN_ONBOARDING_CONFIG: PortalOnboardingConfig = {
  portalPrefix: '/dean',
  apiPrefix: '/api/staff/onboarding',
  portalLabel: 'Dean',
  dashboardPath: '/dean/dashboard',
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

export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;

export function getOnboardingStepPath(
  portalPrefix: PortalOnboardingConfig['portalPrefix'],
  status: string | undefined | null,
  role?: string | null,
): string | null {
  const normalized = normalizeOnboardingStatus(status, role);
  switch (normalized) {
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

export function isFirstLoginOnboardingComplete(status: string | undefined | null, role?: string | null): boolean {
  if (getOnboardingConfigForRole(role)) {
    return normalizeOnboardingStatus(status, role) === 'COMPLETED';
  }
  const value = (status ?? '').trim();
  return value === 'COMPLETED' || value === 'ACTIVE';
}

export function needsPortalOnboarding(status: string | undefined | null, role?: string | null): boolean {
  if (!getOnboardingConfigForRole(role)) return false;
  return getOnboardingStepPath(
    getOnboardingConfigForRole(role)!.portalPrefix,
    status,
    role,
  ) != null;
}

/** Map legacy HR statuses (PENDING_ONBOARDING) onto wizard steps for student/faculty/HOD. */
export function normalizeOnboardingStatus(
  status: string | undefined | null,
  role?: string | null,
): string {
  const value = (status ?? '').trim();
  if (!getOnboardingConfigForRole(role)) return value || 'ACTIVE';
  if (!value || value === 'PENDING_ONBOARDING') return 'PENDING_PASSWORD_RESET';
  if (value === 'IN_PROGRESS') return 'PENDING_DOCUMENTS';
  return value;
}

export function isStaffOnboardingRole(role: string | undefined | null): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'faculty' || r === 'hod' || r === 'dean';
}

export function getStaffOnboardingConfig(role: string | undefined | null): PortalOnboardingConfig {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'dean') return DEAN_ONBOARDING_CONFIG;
  if (r === 'hod') return HOD_ONBOARDING_CONFIG;
  return FACULTY_ONBOARDING_CONFIG;
}

export function getOnboardingConfigForRole(role: string | undefined | null): PortalOnboardingConfig | null {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return STUDENT_ONBOARDING_CONFIG;
  if (isStaffOnboardingRole(r)) return getStaffOnboardingConfig(r);
  return null;
}
