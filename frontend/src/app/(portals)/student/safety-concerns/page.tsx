'use client';

import { SafetyConcernForm } from '@/components/safety/SafetyConcernForm';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';

export default function StudentSafetyConcernsPage() {
  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Safety Concerns"
        description="Report ragging or sexual harassment. Your report is routed to the appropriate committee."
      />
      <SafetyConcernForm />
    </StudentPageShell>
  );
}
