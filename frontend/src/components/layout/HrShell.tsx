'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { HrEntitySwitcher } from '@/components/hr/HrEntitySwitcher';
import { HrEntityProvider } from '@/context/HrEntityContext';
import { useAuth } from '@/context/AuthContext';
import { filterPortalConfigForHrCapabilities, filterPortalConfigForRole, hrPortal } from '@/lib/navigation';

export function HrShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? '';
  const roleFiltered = filterPortalConfigForRole(hrPortal, role);
  const config = filterPortalConfigForHrCapabilities(
    roleFiltered,
    role,
    user?.hr_capabilities,
    user?.permissions,
  );

  return (
    <HrEntityProvider>
      <AppShell config={config} headerExtra={<HrEntitySwitcher />}>
        {children}
      </AppShell>
    </HrEntityProvider>
  );
}
