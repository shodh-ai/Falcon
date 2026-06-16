import { MyOnboardingPanel } from '@/components/self-service/MyOnboardingPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyOnboardingPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader title="Onboarding" description="Complete your new-hire checklist." />
      <MyOnboardingPanel />
    </FacultyPageShell>
  );
}
