'use client';

import FacultyDisciplineIncidentsPage from '@/app/(portals)/faculty/discipline/incidents/page';

export default function HodStudentDisciplinePage() {
  // Render the same scoped incident form used by faculty inside the HOD
  // workspace. The API applies the HOD's tenant/department scope; this page
  // must not redirect into the faculty workspace (which RoleGate correctly
  // denies for an HOD-only account).
  return <FacultyDisciplineIncidentsPage />;
}
