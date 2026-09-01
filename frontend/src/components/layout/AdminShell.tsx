'use client';

import { useMemo, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { adminPortal, filterPortalConfigForRole } from '@/lib/navigation';
import { isPureRegistrarRoles, registrarPortal } from '@/lib/registrar.navigation';

/**
 * Management console shell.
 * Pure Registrar always gets the FINAL Registrar IA sidebar (exact groups/order).
 * SuperAdmin / CampusAdmin keep adminPortal. Route access remains RoleGate / API guards.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const roleKey = (user?.roles?.length ? user.roles : [user?.primaryRole ?? user?.role ?? ''])
    .filter(Boolean)
    .join('|');

  const config = useMemo(() => {
    const roles = roleKey ? roleKey.split('|') : [''];
    if (isPureRegistrarRoles(roles)) {
      // Do not path-filter FINAL Registrar items — the IA list is authoritative.
      // RoleGate + backend @Roles still enforce access on each page/API.
      return filterPortalConfigForRole(registrarPortal, roles);
    }
    return filterPortalConfigForRole(adminPortal, roles);
  }, [roleKey]);

  return <AppShell config={config}>{children}</AppShell>;
}
