'use client';

import { CampusAdminFacultyStaffPage } from '@/components/campus-admin/CampusAdminFacultyStaffPage';

export default function CampusAdminPeopleFacultyPage() {
  return (
    <CampusAdminFacultyStaffPage
      preset="faculty"
      pageTitle="Faculty"
      pageDescription="Faculty and academic leaders on your assigned campus."
    />
  );
}
