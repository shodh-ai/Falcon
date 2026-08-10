'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { RoleGate } from '@/components/layout/RoleGate';
import { useAuth } from '@/context/AuthContext';
import { filterPortalConfigForRole, researchPortal } from '@/lib/navigation';

export default function ResearchLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const roles = user?.roles?.length
    ? user.roles
    : user?.role
      ? [user.role]
      : [];
  const config = filterPortalConfigForRole(researchPortal, roles);

  return (
    <RoleGate>
      <AppShell config={config}>{children}</AppShell>
    </RoleGate>
  );
}
