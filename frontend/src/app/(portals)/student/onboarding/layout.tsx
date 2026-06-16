import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { STUDENT_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function StudentOnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell config={STUDENT_ONBOARDING_CONFIG}>{children}</OnboardingShell>;
}
