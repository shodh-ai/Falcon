import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { HOD_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodOnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell config={HOD_ONBOARDING_CONFIG}>{children}</OnboardingShell>;
}
