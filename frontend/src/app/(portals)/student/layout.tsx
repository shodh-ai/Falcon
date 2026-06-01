import type { ReactNode } from 'react';
import { StudentShell } from '@/components/layout/StudentShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <StudentShell>{children}</StudentShell>
    </RoleGate>
  );
}
