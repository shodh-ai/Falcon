import type { ReactNode } from 'react';
import { RoleGate } from '@/components/layout/RoleGate';
import { DirectoryPortalShell } from '@/components/layout/DirectoryPortalShell';

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <DirectoryPortalShell>{children}</DirectoryPortalShell>
    </RoleGate>
  );
}
