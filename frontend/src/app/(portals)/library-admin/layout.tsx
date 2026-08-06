import type { ReactNode } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';

export default function LibraryAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <GenericPortalShell portal="library">{children}</GenericPortalShell>
    </RoleGate>
  );
}
