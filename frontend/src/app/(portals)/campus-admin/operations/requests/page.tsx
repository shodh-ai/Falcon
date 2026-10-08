'use client';

import { CampusAdminDirectory } from '@/components/campus-admin/CampusAdminDirectory';

export default function CampusRequestsPage() {
  return (
    <CampusAdminDirectory
      title="Campus Requests"
      description="Facilities, hostel, IT, and academic tickets from the existing helpdesk. This is not a second ticketing system."
      endpoint="/api/campus-admin/requests"
      columns={[
        { key: 'ticket_ref', label: 'Ref' },
        { key: 'category', label: 'Category' },
        { key: 'subject', label: 'Subject' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Opened' },
      ]}
    />
  );
}
