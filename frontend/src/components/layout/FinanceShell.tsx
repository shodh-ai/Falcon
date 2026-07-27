'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { financePortal, filterPortalConfigForRole } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';

export function FinanceShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role;
  const config = filterPortalConfigForRole(financePortal, role);

  return <AppShell config={config}>{children}</AppShell>;
}
