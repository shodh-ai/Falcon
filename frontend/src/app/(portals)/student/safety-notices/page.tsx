'use client';

import { SafetyNoticesPanel } from '@/components/safety/SafetyNoticesPanel';
import { StudentPageShell } from '@/components/student/StudentPageShell';

export default function StudentSafetyNoticesPage() {
  return (
    <StudentPageShell>
      <SafetyNoticesPanel
        title="Safety Notices"
        description="Official notices when a safety concern involving you is under review or has been closed by the Disciplinary Committee. Do not contact any student about these matters."
      />
    </StudentPageShell>
  );
}
