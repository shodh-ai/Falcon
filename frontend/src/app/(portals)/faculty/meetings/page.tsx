'use client';

import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';

export default function FacultyMeetingsPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Meetings"
        description="Schedule and manage faculty meetings, agendas, and minutes."
      />
      <MeetingWorkspace workspaceLabel="Faculty Portal" hidePageHeader />
    </FacultyPageShell>
  );
}
