import { MyOffboardingPanel } from '@/components/self-service/MyOffboardingPanel';
import { SelfServiceStubPage } from '@/components/self-service/SelfServiceStubPage';

export default function FacultyOffboardingPage() {
  return (
    <SelfServiceStubPage title="Resignation" description="Initiate separation and notice period.">
      <MyOffboardingPanel />
    </SelfServiceStubPage>
  );
}
