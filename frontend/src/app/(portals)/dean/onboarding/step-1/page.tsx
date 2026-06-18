import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { DEAN_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodOnboardingStep1Page() {
  return <OnboardingStep1 config={DEAN_ONBOARDING_CONFIG} />;
}
