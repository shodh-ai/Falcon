'use client';

import { useMemo, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { canRoleAccessPath, type HrCapabilities } from '@/lib/auth-routing';
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
    const scoped = filterPortalConfigForRole(adminPortal, roles);
    return {
      ...scoped,
      navGroups: scoped.navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            canRoleAccessPath(
              roles,
              item.href,
              user?.hr_capabilities as HrCapabilities | undefined,
              user?.permissions,
              user?.email,
            ),
          ),
        }))
        .filter((group) => group.items.length > 0),
      commandItems: scoped.commandItems.filter((item) =>
        canRoleAccessPath(
          roles,
          item.href,
          user?.hr_capabilities as HrCapabilities | undefined,
          user?.permissions,
          user?.email,
        ),
      ),
    };
  }, [roleKey, user?.email, user?.hr_capabilities, user?.permissions]);

  return <AppShell config={config}>{children}</AppShell>;
}
