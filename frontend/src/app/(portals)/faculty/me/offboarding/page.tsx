import { MyOffboardingPanel } from '@/components/self-service/MyOffboardingPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyOffboardingPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader title="Resignation" description="Initiate separation and notice period." />
      <MyOffboardingPanel />
    </FacultyPageShell>
  );
}
