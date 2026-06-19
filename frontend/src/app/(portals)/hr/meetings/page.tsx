'use client';

import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';

export default function HrMeetingsPage() {
  return (
    <div className="p-4 sm:p-6">
      <MeetingWorkspace workspaceLabel="HR Operations" />
    </div>
  );
}
