import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function FacultyOnboardingStep2Page() {
  return <OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} />;
}
