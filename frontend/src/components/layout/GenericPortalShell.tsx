'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import {
  financePortal,
  hodPortal,
  deanPortal,
  hostelAdminPortal,
  incubationPortal,
  iqacPortal,
  libraryPortal,
  parentPortal,
  disciplinaryCommitteePortal,
  examCellPortal,
  presidentPortal,
  alumniPortal,
  alumniAdminPortal,
  adminOpsPortal,
  placementPortal,
  filterPortalConfigForRole,
} from '@/lib/navigation';
import { isPureRegistrarRoles, registrarPortal } from '@/lib/registrar.navigation';

type PortalKey =
  | 'hod'
  | 'dean'
  | 'hostel-admin'
  | 'incubation'
  | 'finance'
  | 'iqac'
  | 'library'
  | 'president'
  | 'parent'
  | 'disciplinary-committee'
  | 'exam-cell'
  | 'alumni'
  | 'alumni-admin'
  | 'admin-ops'
  | 'placements';

const configs = {
  hod: hodPortal,
  dean: deanPortal,
  'hostel-admin': hostelAdminPortal,
  incubation: incubationPortal,
  finance: financePortal,
  iqac: iqacPortal,
  library: libraryPortal,
  parent: parentPortal,
  'disciplinary-committee': disciplinaryCommitteePortal,
  'exam-cell': examCellPortal,
  president: presidentPortal,
  alumni: alumniPortal,
  'alumni-admin': alumniAdminPortal,
  'admin-ops': adminOpsPortal,
  placements: placementPortal,
};

export function GenericPortalShell({
  children,
  portal,
}: {
  children: ReactNode;
  portal: PortalKey | 'dean';
}) {
  const { user } = useAuth();
  const roles = (user?.roles?.length ? user.roles : [user?.primaryRole ?? user?.role ?? ''])
    .filter(Boolean)
    .map(String);

  // Keep FINAL Registrar sidebar when Registrar opens shared surfaces
  // (e.g. /iqac/repository, /admin-ops/convocation). Other roles unchanged.
  if (isPureRegistrarRoles(roles)) {
    return (
      <AppShell config={filterPortalConfigForRole(registrarPortal, roles)}>
        {children}
      </AppShell>
    );
  }

  const config = configs[portal];
  return <AppShell config={config}>{children}</AppShell>;
}
