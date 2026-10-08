'use client';

import { CampusAdminDirectory } from '@/components/campus-admin/CampusAdminDirectory';

export default function CampusFacilitiesPage() {
  return (
    <CampusAdminDirectory
      title="Facilities"
      description="Bookable campus venues from the existing facilities register."
      endpoint="/api/campus-admin/facilities"
      columns={[
        { key: 'name', label: 'Facility' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'is_bookable_by_students', label: 'Student bookable' },
      ]}
    />
  );
}
