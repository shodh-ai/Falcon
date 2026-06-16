import { OnboardingStep3 } from '@/components/onboarding/OnboardingStep3';
import { STUDENT_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function StudentOnboardingStep3Page() {
  return <OnboardingStep3 config={STUDENT_ONBOARDING_CONFIG} />;
}
