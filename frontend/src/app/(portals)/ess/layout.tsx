import type { ReactNode } from 'react';
import { EssShell } from '@/components/layout/EssShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function EssPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <EssShell>{children}</EssShell>
    </RoleGate>
  );
}
