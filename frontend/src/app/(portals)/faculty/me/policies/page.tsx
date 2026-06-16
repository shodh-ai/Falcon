import { MyPoliciesPanel } from '@/components/self-service/MyPoliciesPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyPoliciesPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader description="Read, acknowledge, and vote on mandatory company policies." />
      <MyPoliciesPanel />
    </FacultyPageShell>
  );
}
