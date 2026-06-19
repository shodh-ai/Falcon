'use client';

import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';
import { HodPageFrame } from '@/components/hod/HodPagePrimitives';

export default function HodMeetingsPage() {
  return (
    <HodPageFrame>
      <MeetingWorkspace workspaceLabel="HOD Workspace" />
    </HodPageFrame>
  );
}
