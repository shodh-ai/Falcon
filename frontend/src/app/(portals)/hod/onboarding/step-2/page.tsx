import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { StaffProfileFreezeGate } from '@/components/onboarding/StaffProfileFreezeGate';
import { HOD_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodOnboardingStep2Page() {
  return <StaffProfileFreezeGate initialReview><OnboardingStep2 config={HOD_ONBOARDING_CONFIG} /></StaffProfileFreezeGate>;
}
