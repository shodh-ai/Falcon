export type OnboardingPortalKind = 'student' | 'staff';

export const STUDENT_ONBOARDING_DOC_TYPES = ['AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET', 'PHOTO'] as const;
export const STAFF_ONBOARDING_DOC_TYPES = ['AADHAAR', 'PAN', 'HIGHEST_DEGREE', 'PHOTO'] as const;

export type StudentOnboardingDocType = (typeof STUDENT_ONBOARDING_DOC_TYPES)[number];
export type StaffOnboardingDocType = (typeof STAFF_ONBOARDING_DOC_TYPES)[number];

const STAFF_ROLES = new Set(['faculty', 'hod', 'dean']);
const FIRST_LOGIN_WIZARD_ROLES = new Set(['student', 'applicant', 'faculty', 'hod', 'dean']);

export function requiresFirstLoginWizard(roleName: string | undefined | null): boolean {
  return FIRST_LOGIN_WIZARD_ROLES.has((roleName ?? '').trim().toLowerCase());
}

/** Status assigned when HR/admissions creates a new portal user who must complete the wizard. */
export function getInitialOnboardingStatusForRole(roleName: string | undefined | null): string {
  return requiresFirstLoginWizard(roleName) ? 'PENDING_PASSWORD_RESET' : 'PENDING_ONBOARDING';
}

/** Map legacy HR onboarding statuses onto the first-login wizard steps. */
export function normalizeOnboardingStatusForWizard(
  status: string | undefined | null,
  roleName: string | undefined | null,
): string {
  const value = (status ?? 'ACTIVE').trim();
  if (!requiresFirstLoginWizard(roleName)) return value;
  if (value === 'PENDING_ONBOARDING') return 'PENDING_PASSWORD_RESET';
  if (value === 'IN_PROGRESS') return 'PENDING_DOCUMENTS';
  return value;
}

export function resolveOnboardingPortalKind(roleName: string | undefined | null): OnboardingPortalKind {
  const role = (roleName ?? '').trim().toLowerCase();
  return STAFF_ROLES.has(role) ? 'staff' : 'student';
}

export function getRequiredDocTypes(kind: OnboardingPortalKind): readonly string[] {
  return kind === 'staff' ? STAFF_ONBOARDING_DOC_TYPES : STUDENT_ONBOARDING_DOC_TYPES;
}

export function getDashboardPathForRoleName(roleName: string | undefined | null): string {
  const role = (roleName ?? '').trim().toLowerCase();
  if (role === 'dean') return '/dean/dashboard';
  if (role === 'hod') return '/hod/dashboard';
  if (role === 'faculty') return '/faculty/dashboard';
  if (role === 'student' || role === 'applicant') return '/student/dashboard';
  return '/dashboard';
}
