import { MyOnboardingPanel } from '@/components/self-service/MyOnboardingPanel';
import { SelfServiceStubPage } from '@/components/self-service/SelfServiceStubPage';

export default function HrOnboardingPage() {
  return (
    <SelfServiceStubPage title="Onboarding" description="Complete your new-hire checklist.">
      <MyOnboardingPanel />
    </SelfServiceStubPage>
  );
}
