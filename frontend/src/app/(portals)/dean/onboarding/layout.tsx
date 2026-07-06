import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { DEAN_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function DeanOnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell config={DEAN_ONBOARDING_CONFIG}>{children}</OnboardingShell>;
}
