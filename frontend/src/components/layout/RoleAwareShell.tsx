'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { getDashboardPathForRole } from '@/lib/auth-routing';
import {
  adminOpsPortal,
  adminPortal,
  alumniPortal,
  deanPortal,
  examCellPortal,
  facultyPortal,
  financePortal,
  hodPortal,
  hostelAdminPortal,
  hrPortal,
  iqacPortal,
  leadershipPortal,
  libraryPortal,
  parentPortal,
  placementPortal,
  presidentPortal,
  studentPortal,
  type PortalConfig,
} from '@/lib/navigation';

export function portalForRole(role: string): PortalConfig {
  const r = role.trim().toLowerCase();
  if (r === 'student' || r === 'applicant') return studentPortal;
  if (r === 'faculty') return facultyPortal;
  if (r === 'hod') return hodPortal;
  if (r === 'dean') return deanPortal;
  if (r === 'hr' || r === 'hradmin') return hrPortal;
  if (r === 'warden') return hostelAdminPortal;
  if (r === 'accountant') return financePortal;
  if (r === 'iqac') return iqacPortal;
  if (r === 'librarian') return libraryPortal;
  if (r === 'president' || r === 'vice chancellor') return presidentPortal;
  if (r === 'chairman') return leadershipPortal;
  if (r === 'parent') return parentPortal;
  if (r === 'alumni') return alumniPortal;
  if (r === 'examcell' || r === 'exam cell') return examCellPortal;
  if (r === 'placementcell' || r === 'placement cell') return placementPortal;
  if (r === 'transportofficer' || r === 'transport officer') return adminOpsPortal;
  if (r === 'registrar') return adminPortal;
  return adminPortal;
}

/** True when the role uses the Management adminPortal sidebar (shared with /admin/*). */
export function usesManagementAdminSidebar(role: string | undefined | null): boolean {
  return portalForRole(role ?? '') === adminPortal;
}

export function RoleAwareShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? 'Faculty';
  const config = portalForRole(role);
  const home = getDashboardPathForRole(role);

  return (
    <AppShell config={config} profileHref={home.replace('/dashboard', '/profile')}>
      {children}
    </AppShell>
  );
}
