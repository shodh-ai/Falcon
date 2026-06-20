'use client';

import { VenueApprovalsQueue } from '@/components/venues/VenueApprovalsQueue';

export default function LibraryVenueRequestsPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <VenueApprovalsQueue
        title="Library Venue Requests"
        description="Approve or reject student bookings for library GD rooms and quiet zones."
        loadPending={(api) => api.librarianPending()}
        approve={(api, id) => api.librarianApprove(id)}
        reject={(api, id, remarks) => api.librarianReject(id, remarks)}
      />
    </div>
  );
}
