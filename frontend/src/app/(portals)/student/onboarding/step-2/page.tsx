import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { STUDENT_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function StudentOnboardingStep2Page() {
  return <OnboardingStep2 config={STUDENT_ONBOARDING_CONFIG} />;
}
