import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function AdminOpsLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <GenericPortalShell portal="admin-ops">{children}</GenericPortalShell>
    </RoleGate>
  );
}
