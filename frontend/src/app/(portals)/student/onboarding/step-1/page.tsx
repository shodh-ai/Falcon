import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { STUDENT_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function StudentOnboardingStep1Page() {
  return <OnboardingStep1 config={STUDENT_ONBOARDING_CONFIG} />;
}
