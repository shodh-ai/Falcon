'use client';

import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';
import { WeeklyWorkloadPanel } from '@/components/faculty/FacultyProfilePage';
import { useAuthedApi } from '@/lib/api';

export default function FacultyWorkloadPage() {
  const api = useAuthedApi();
  return (
    <FacultyPageShell>
      <FacultyPageHeader title="My Workload" description="Your teaching workload for each week, updated for approved class changes." />
      <WeeklyWorkloadPanel api={api} />
    </FacultyPageShell>
  );
}
