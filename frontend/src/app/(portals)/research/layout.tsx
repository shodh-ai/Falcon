'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { RoleGate } from '@/components/layout/RoleGate';
import { useAuth } from '@/context/AuthContext';
import { filterPortalConfigForRole, researchPortal } from '@/lib/navigation';

export default function ResearchLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const config = filterPortalConfigForRole(researchPortal, user?.role);

  return (
    <RoleGate>
      <AppShell config={config}>{children}</AppShell>
    </RoleGate>
  );
}
