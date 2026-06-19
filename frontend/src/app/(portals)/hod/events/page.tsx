'use client';

import { EventApprovalsQueue } from '@/components/events/EventApprovalsQueue';
import { HodPageFrame } from '@/components/hod/HodPagePrimitives';

export default function HodEventsPage() {
  return (
    <HodPageFrame>
      <EventApprovalsQueue
        title="Club Event Approvals"
        description="Review club proposals after faculty coordinator sign-off."
        loadPending={(api) => api.hodPending()}
        approve={(api, id) => api.approveHod(id)}
        reject={(api, id, comment) => api.rejectHod(id, comment)}
        approveLabel="Approved — sent to Dean"
      />
    </HodPageFrame>
  );
}
