import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function AlumniAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <GenericPortalShell portal="alumni-admin">{children}</GenericPortalShell>
    </RoleGate>
  );
}
