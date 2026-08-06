'use client';

import { useMemo, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { adminPortal, filterPortalConfigForRole } from '@/lib/navigation';

/**
 * Management console shell.
 * Filters sidebar items by the signed-in user's roles (same pattern as HrShell).
 * Route access remains enforced by RoleGate / API guards.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const roleKey = (user?.roles?.length ? user.roles : [user?.primaryRole ?? user?.role ?? ''])
    .filter(Boolean)
    .join('|');

  const config = useMemo(() => {
    const roles = roleKey ? roleKey.split('|') : [''];
    return filterPortalConfigForRole(adminPortal, roles);
  }, [roleKey]);

  return <AppShell config={config}>{children}</AppShell>;
}
