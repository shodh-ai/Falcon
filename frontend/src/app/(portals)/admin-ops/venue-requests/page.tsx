'use client';

import { VenueApprovalsQueue } from '@/components/venues/VenueApprovalsQueue';

export default function AdminOpsVenueRequestsPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <VenueApprovalsQueue
        title="Estate Venue Requests"
        description="Confirm large seminar halls and central campus spaces before students receive room passes."
        loadPending={(api) => api.estatePending()}
        approve={(api, id) => api.estateApprove(id)}
        reject={(api, id, remarks) => api.estateReject(id, remarks)}
      />
    </div>
  );
}
