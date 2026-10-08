import { Suspense } from 'react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';

function MeetingsLoading() {
  return <FalconLoader label="Loading executive meetings…" />;
}

export default function PresidentMeetingsPage() {
  return (
    <div className={EXECUTIVE_SPACING.page}>
      <Suspense fallback={<MeetingsLoading />}>
        <MeetingWorkspace
          workspaceLabel="President Office"
          description="Schedule board meetings, review requests from deans and HODs, and publish executive minutes."
          syncExecutiveActionItems
        />
      </Suspense>
    </div>
  );
}
