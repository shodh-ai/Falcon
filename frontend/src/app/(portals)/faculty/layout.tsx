import type { ReactNode } from 'react';
import { FacultyShell } from '@/components/layout/FacultyShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function FacultyPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <FacultyShell>{children}</FacultyShell>
    </RoleGate>
  );
}
