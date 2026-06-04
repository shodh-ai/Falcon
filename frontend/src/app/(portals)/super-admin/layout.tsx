import type { ReactNode } from 'react';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <SuperAdminShell>{children}</SuperAdminShell>
    </RoleGate>
  );
}
