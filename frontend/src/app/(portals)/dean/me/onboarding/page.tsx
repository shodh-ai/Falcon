import { MyOnboardingPanel } from '@/components/self-service/MyOnboardingPanel';
import { SelfServiceStubPage } from '@/components/self-service/SelfServiceStubPage';

export default function HodOnboardingPage() {
  return (
    <SelfServiceStubPage title="Onboarding" description="Complete your new-hire checklist.">
      <MyOnboardingPanel />
    </SelfServiceStubPage>
  );
}
