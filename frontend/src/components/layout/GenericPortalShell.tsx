'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  financePortal,
  hodPortal,
  deanPortal,
  hostelAdminPortal,
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
} from '@/lib/navigation';

type PortalKey =
  | 'hod'
  | 'dean'
  | 'hostel-admin'
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
  const config = configs[portal];
  return (
    <AppShell config={config}>
      {children}
    </AppShell>
  );
}
