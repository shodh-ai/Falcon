import type { ReactNode } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';
import { RoleAwareShell } from '@/components/layout/RoleAwareShell';

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <RoleAwareShell>{children}</RoleAwareShell>
    </RoleGate>
  );
}
