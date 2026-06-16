import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function FacultyOnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell config={FACULTY_ONBOARDING_CONFIG}>{children}</OnboardingShell>;
}
