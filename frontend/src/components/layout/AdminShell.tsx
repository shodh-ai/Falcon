'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { adminPortal, filterPortalConfigForRole } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const config = filterPortalConfigForRole(adminPortal, user?.role);

  return (
    <AppShell config={config}>
      {children}
    </AppShell>
  );
}
