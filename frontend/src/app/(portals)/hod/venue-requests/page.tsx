'use client';

import { VenueApprovalsQueue } from '@/components/venues/VenueApprovalsQueue';

export default function HodVenueRequestsPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <VenueApprovalsQueue
        title="Department Venue Requests"
        description="Review classroom and seminar hall bookings routed to your department authority."
        loadPending={(api) => api.hodPending()}
        approve={(api, id) => api.hodApprove(id)}
        reject={(api, id, remarks) => api.hodReject(id, remarks)}
      />
    </div>
  );
}
