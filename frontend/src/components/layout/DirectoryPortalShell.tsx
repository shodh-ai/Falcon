'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { RoleAwareShell, usesManagementAdminSidebar } from '@/components/layout/RoleAwareShell';
import { useAuth } from '@/context/AuthContext';

/**
 * Management users share AdminShell with /admin/* so Modules nav stays identical.
 * Other roles keep their own portal via RoleAwareShell.
 */
export function DirectoryPortalShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role;
  if (usesManagementAdminSidebar(role)) {
    return <AdminShell>{children}</AdminShell>;
  }
  return <RoleAwareShell>{children}</RoleAwareShell>;
}
