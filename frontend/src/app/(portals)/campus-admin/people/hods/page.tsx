'use client';

import { CampusAdminFacultyStaffPage } from '@/components/campus-admin/CampusAdminFacultyStaffPage';

export default function CampusAdminPeopleHodsPage() {
  return (
    <CampusAdminFacultyStaffPage
      preset="hod"
      pageTitle="HODs"
      pageDescription="Heads of department on your assigned campus."
    />
  );
}
