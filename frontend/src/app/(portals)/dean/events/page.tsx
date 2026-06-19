'use client';

import { EventApprovalsQueue } from '@/components/events/EventApprovalsQueue';

export default function DeanEventsPage() {
  return (
    <div className="p-4 sm:p-6">
      <EventApprovalsQueue
        title="Club Event Approvals"
        description="Dean sign-off for club events after HOD approval."
        loadPending={(api) => api.deanPending()}
        approve={(api, id) => api.approveDean(id)}
        reject={(api, id, comment) => api.rejectDean(id, comment)}
        approveLabel="Approved — sent to finance or live"
      />
    </div>
  );
}
