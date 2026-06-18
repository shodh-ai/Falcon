import { OnboardingStep3 } from '@/components/onboarding/OnboardingStep3';
import { DEAN_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodOnboardingStep3Page() {
  return <OnboardingStep3 config={DEAN_ONBOARDING_CONFIG} />;
}
