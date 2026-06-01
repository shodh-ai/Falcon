import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <AdminShell>{children}</AdminShell>
    </RoleGate>
  );
}
