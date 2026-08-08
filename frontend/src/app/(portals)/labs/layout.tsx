import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function LabsLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <GenericPortalShell portal="labs">{children}</GenericPortalShell>
    </RoleGate>
  );
}
