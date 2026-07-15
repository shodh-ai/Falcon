import type { ReactNode } from 'react';
import { CampusAdminShell } from '@/components/layout/CampusAdminShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function CampusAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <CampusAdminShell>{children}</CampusAdminShell>
    </RoleGate>
  );
}
