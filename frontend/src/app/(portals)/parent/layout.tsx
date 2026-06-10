import type { ReactNode } from 'react';
import { ParentShell } from '@/components/parent/ParentShell';
import { ParentPageShell } from '@/components/parent/ParentPageShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <ParentShell>
        <ParentPageShell>{children}</ParentPageShell>
      </ParentShell>
    </RoleGate>
  );
}
