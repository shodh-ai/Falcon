import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { DEAN_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function DeanOnboardingStep2Page() {
  return <OnboardingStep2 config={DEAN_ONBOARDING_CONFIG} />;
}
