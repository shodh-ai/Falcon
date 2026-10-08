'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
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
  labsPortal,
  competitionsPortal,
  operationsPortal,
  specialProgramsPortal,
} from '@/lib/navigation';

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
  | 'placements'
  | 'labs'
  | 'competitions'
  | 'operations'
  | 'special-programs';

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
  labs: labsPortal,
  competitions: competitionsPortal,
  operations: operationsPortal,
  'special-programs': specialProgramsPortal,
};

export function GenericPortalShell({
  children,
  portal,
}: {
  children: ReactNode;
  portal: PortalKey | 'dean';
}) {
  const config = configs[portal];
  return (
    <AppShell config={config}>
      {children}
    </AppShell>
  );
}
