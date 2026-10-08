'use client';

import { PhdApplicationPanel } from '@/components/phd/PhdApplicationPanel';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';

export default function StudentPhdPage() {
  return (
    <StudentPageShell>
      <StudentPageHeader
        title="PhD Portal"
        description="Apply for admission and track your full Ph.D. lifecycle from guide allocation to degree award."
      />
      <PhdApplicationPanel />
    </StudentPageShell>
  );
}
