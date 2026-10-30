import {OnboardingStep2} from '@/components/onboarding/OnboardingStep2';
import {StaffProfileFreezeGate} from '@/components/onboarding/StaffProfileFreezeGate';
import {PRINCIPAL_ONBOARDING_CONFIG} from '@/lib/onboarding/portal-onboarding';
export default function Step(){return <StaffProfileFreezeGate initialReview><OnboardingStep2 config={PRINCIPAL_ONBOARDING_CONFIG}/></StaffProfileFreezeGate>;}
