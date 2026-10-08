'use client';

import { StudentPageShell } from '@/components/student/StudentPageShell';
import { UniversityPoliciesWorkspace } from '@/components/student/UniversityPoliciesWorkspace';
import { StudentPoliciesPanel } from '@/components/student/StudentPoliciesPanel';

export default function StudentPoliciesPage() {
  return (
    <StudentPageShell width="5xl" className="space-y-8">
      <UniversityPoliciesWorkspace />
      <StudentPoliciesPanel />
    </StudentPageShell>
  );
}
