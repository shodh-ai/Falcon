import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { HOD_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodOnboardingStep1Page() {
  return <OnboardingStep1 config={HOD_ONBOARDING_CONFIG} />;
}
