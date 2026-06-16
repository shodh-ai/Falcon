import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { HOD_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodOnboardingStep2Page() {
  return <OnboardingStep2 config={HOD_ONBOARDING_CONFIG} />;
}
