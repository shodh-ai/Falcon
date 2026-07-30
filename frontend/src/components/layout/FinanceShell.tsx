'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { financePortal, filterPortalConfigForRole } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';
import { getFinancePortalBranding } from '@/lib/dofa-portal-routes';
import {
  getAvailableWorkspaces,
  resolveActiveWorkspaceRole,
  resolveUserRoleList,
} from '@/lib/available-workspaces';

export function FinanceShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const workspaces = getAvailableWorkspaces(user);
  const roles = resolveUserRoleList(user);
  const role =
    resolveActiveWorkspaceRole(pathname, user, workspaces) ??
    user?.primaryRole ??
    user?.role ??
    roles[0] ??
    '';
  const config = filterPortalConfigForRole(financePortal, role);
  const branding = getFinancePortalBranding(role);

  return <AppShell config={{ ...config, ...branding }}>{children}</AppShell>;
}
