'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FinanceShell } from '@/components/layout/FinanceShell';
import { RoleGate } from '@/components/layout/RoleGate';
import { useAuth } from '@/context/AuthContext';
import { getFinancePortalRedirect } from '@/lib/dofa-portal-routes';
import {
  getAvailableWorkspaces,
  resolveActiveWorkspaceRole,
  resolveUserRoleList,
} from '@/lib/available-workspaces';

function FinanceLayoutInner({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    const workspaces = getAvailableWorkspaces(user);
    const roles = resolveUserRoleList(user);
    const activeRole =
      resolveActiveWorkspaceRole(pathname, user, workspaces) ??
      user.primaryRole ??
      user.role ??
      roles[0] ??
      '';
    const redirect = getFinancePortalRedirect(activeRole, pathname);
    if (redirect) router.replace(redirect);
  }, [isLoading, user, pathname, router]);

  return <FinanceShell>{children}</FinanceShell>;
}

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <FinanceLayoutInner>{children}</FinanceLayoutInner>
    </RoleGate>
  );
}
