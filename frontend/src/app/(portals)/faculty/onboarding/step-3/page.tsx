import { OnboardingStep3 } from '@/components/onboarding/OnboardingStep3';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function FacultyOnboardingStep3Page() {
  return <OnboardingStep3 config={FACULTY_ONBOARDING_CONFIG} />;
}
