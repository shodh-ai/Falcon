import type { ReactNode } from 'react';
import { HrShell } from '@/components/layout/HrShell';
import { HrPageShell } from '@/components/hr/HrPageShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function HrPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <HrShell>
        <HrPageShell>{children}</HrPageShell>
      </HrShell>
    </RoleGate>
  );
}
