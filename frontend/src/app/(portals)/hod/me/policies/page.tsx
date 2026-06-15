import { MyPoliciesPanel } from '@/components/self-service/MyPoliciesPanel';
import { SelfServiceStubPage } from '@/components/self-service/SelfServiceStubPage';

export default function HodPoliciesPage() {
  return (
    <SelfServiceStubPage title="Company Policies" description="Read and acknowledge mandatory policies.">
      <MyPoliciesPanel />
    </SelfServiceStubPage>
  );
}
