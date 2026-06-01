import type { ReactNode } from 'react';
import { HrShell } from '@/components/layout/HrShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function HrPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <HrShell>{children}</HrShell>
    </RoleGate>
  );
}
