import { MyPoliciesPanel } from '@/components/self-service/MyPoliciesPanel';
import { SelfServiceStubPage } from '@/components/self-service/SelfServiceStubPage';

export default function FacultyPoliciesPage() {
  return (
    <SelfServiceStubPage title="Company Policies" description="Read and acknowledge mandatory policies.">
      <MyPoliciesPanel />
    </SelfServiceStubPage>
  );
}
