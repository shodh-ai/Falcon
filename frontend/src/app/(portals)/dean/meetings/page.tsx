'use client';

import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';

export default function DeanMeetingsPage() {
  return (
    <div className="p-4 sm:p-6">
      <MeetingWorkspace workspaceLabel="Dean Workspace" />
    </div>
  );
}
