import type { ReactNode } from 'react';
import { LeadershipPortalShell } from '@/components/leadership/LeadershipPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function LeadershipLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <LeadershipPortalShell>{children}</LeadershipPortalShell>
    </RoleGate>
  );
}
