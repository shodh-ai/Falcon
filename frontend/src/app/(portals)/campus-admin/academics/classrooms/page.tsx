'use client';

import { CampusAdminDirectory } from '@/components/campus-admin/CampusAdminDirectory';

export default function CampusClassroomsPage() {
  return (
    <CampusAdminDirectory
      title="Classrooms"
      description="Campus venues used for teaching and bookings. Room assignment continues to use the existing timetable."
      endpoint="/api/campus-admin/classrooms"
      columns={[
        { key: 'name', label: 'Room / venue' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'max_duration_mins', label: 'Max duration (min)' },
      ]}
    />
  );
}
