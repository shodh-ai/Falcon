import { MyPoliciesPanel } from '@/components/self-service/MyPoliciesPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyPoliciesPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="University Policies"
        description="Read, acknowledge, and vote on mandatory university policies."
      />
      <MyPoliciesPanel />
    </FacultyPageShell>
  );
}
