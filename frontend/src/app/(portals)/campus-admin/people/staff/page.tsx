'use client';

import { CampusAdminFacultyStaffPage } from '@/components/campus-admin/CampusAdminFacultyStaffPage';

export default function CampusAdminPeopleStaffPage() {
  return (
    <CampusAdminFacultyStaffPage
      preset="staff"
      pageTitle="Staff & Admin"
      pageDescription="Administrative and support staff on your assigned campus."
    />
  );
}
