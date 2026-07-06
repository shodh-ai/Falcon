'use client';

import { StudentPoliciesPanel } from '@/components/student/StudentPoliciesPanel';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';

export default function StudentPoliciesPage() {
  return (
    <StudentPageShell>
      <StudentPageHeader
        title="University Policies"
        description="Read, acknowledge, and vote on mandatory policies and rules set by the University Authorities."
      />
      <StudentPoliciesPanel />
    </StudentPageShell>
  );
}
