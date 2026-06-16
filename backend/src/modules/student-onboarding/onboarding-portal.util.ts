export type OnboardingPortalKind = 'student' | 'staff';

export const STUDENT_ONBOARDING_DOC_TYPES = ['AADHAAR', '10TH_MARKSHEET', '12TH_MARKSHEET', 'PHOTO'] as const;
export const STAFF_ONBOARDING_DOC_TYPES = ['AADHAAR', 'PAN', 'HIGHEST_DEGREE', 'PHOTO'] as const;

export type StudentOnboardingDocType = (typeof STUDENT_ONBOARDING_DOC_TYPES)[number];
export type StaffOnboardingDocType = (typeof STAFF_ONBOARDING_DOC_TYPES)[number];

const STAFF_ROLES = new Set(['faculty', 'hod', 'dean']);

export function resolveOnboardingPortalKind(roleName: string | undefined | null): OnboardingPortalKind {
  const role = (roleName ?? '').trim().toLowerCase();
  return STAFF_ROLES.has(role) ? 'staff' : 'student';
}

export function getRequiredDocTypes(kind: OnboardingPortalKind): readonly string[] {
  return kind === 'staff' ? STAFF_ONBOARDING_DOC_TYPES : STUDENT_ONBOARDING_DOC_TYPES;
}

export function getDashboardPathForRoleName(roleName: string | undefined | null): string {
  const role = (roleName ?? '').trim().toLowerCase();
  if (role === 'hod' || role === 'dean') return '/hod/dashboard';
  if (role === 'faculty') return '/faculty/dashboard';
  if (role === 'student' || role === 'applicant') return '/student/dashboard';
  return '/dashboard';
}
