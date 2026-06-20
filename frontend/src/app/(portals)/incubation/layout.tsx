import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function IncubationLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <GenericPortalShell portal="incubation">{children}</GenericPortalShell>
    </RoleGate>
  );
}
