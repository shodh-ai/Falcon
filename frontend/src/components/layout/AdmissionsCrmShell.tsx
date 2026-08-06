'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { CampusAdminShell } from '@/components/layout/CampusAdminShell';
import { usesManagementAdminSidebar } from '@/components/layout/RoleAwareShell';
import { isCampusAdminFamilyRole, normalizeRoleName } from '@/lib/campus-admin.roles';
import { useAuth } from '@/context/AuthContext';

/**
 * Pick the same sidebar family the user already sees in their home portal:
 * - Campus Admin / Admissions Officer → Platform + Admissions nav
 * - Registrar & other Management roles → Overview + Modules nav
 */
function admissionsCrmShellVariant(role: string | undefined | null): 'admin' | 'campus' {
  const normalized = normalizeRoleName(role ?? '');
  if (normalized === 'registrar') return 'admin';
  if (isCampusAdminFamilyRole(role ?? '')) return 'campus';
  if (usesManagementAdminSidebar(role)) return 'admin';
  return 'campus';
}

export function AdmissionsCrmShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role;
  if (admissionsCrmShellVariant(role) === 'admin') {
    return <AdminShell>{children}</AdminShell>;
  }
  return <CampusAdminShell>{children}</CampusAdminShell>;
}

export { CampusAdminShell, SuperAdminShell } from '@/components/layout/CampusAdminShell';
