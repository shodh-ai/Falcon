import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function CompetitionsLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <GenericPortalShell portal="competitions">{children}</GenericPortalShell>
    </RoleGate>
  );
}
