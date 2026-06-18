'use client';

import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';
import { FacultyPageShell } from '@/components/faculty';

export default function FacultyMeetingsPage() {
  return (
    <FacultyPageShell>
      <MeetingWorkspace workspaceLabel="Faculty Portal" />
    </FacultyPageShell>
  );
}
