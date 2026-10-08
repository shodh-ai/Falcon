'use client';

import { SafetyNoticesPanel } from '@/components/safety/SafetyNoticesPanel';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultySafetyNoticesPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Safety Notices"
        description="Official notices when a student safety concern involving you is under review or has been closed."
      />
      <SafetyNoticesPanel
        embedded
        title="Safety Notices"
        description="You are notified only after the case is marked under review. Do not contact any student about these matters."
      />
    </FacultyPageShell>
  );
}
