import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function FacultyOnboardingStep1Page() {
  return <OnboardingStep1 config={FACULTY_ONBOARDING_CONFIG} />;
}
