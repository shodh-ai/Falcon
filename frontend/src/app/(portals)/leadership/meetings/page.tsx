'use client';

import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';

export default function LeadershipMeetingsPage() {
  return (
    <div className={EXECUTIVE_SPACING.page}>
      <MeetingWorkspace workspaceLabel="Chairman / Executive Board" />
    </div>
  );
}
