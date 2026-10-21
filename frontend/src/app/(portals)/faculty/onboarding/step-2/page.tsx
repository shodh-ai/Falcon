import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { StaffProfileFreezeGate } from '@/components/onboarding/StaffProfileFreezeGate';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function FacultyOnboardingStep2Page() {
  return <StaffProfileFreezeGate initialReview><OnboardingStep2 config={FACULTY_ONBOARDING_CONFIG} /></StaffProfileFreezeGate>;
}
