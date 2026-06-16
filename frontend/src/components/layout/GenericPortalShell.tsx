'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  financePortal,
  hodPortal,
  hostelAdminPortal,
  iqacPortal,
  libraryPortal,
  parentPortal,
  examCellPortal,
  presidentPortal,
  alumniPortal,
  alumniAdminPortal,
  adminOpsPortal,
  placementPortal,
} from '@/lib/navigation';

type PortalKey =
  | 'hod'
  | 'hostel-admin'
  | 'finance'
  | 'iqac'
  | 'library'
  | 'president'
  | 'parent'
  | 'exam-cell'
  | 'alumni'
  | 'alumni-admin'
  | 'admin-ops'
  | 'placements';

const configs = {
  hod: hodPortal,
  'hostel-admin': hostelAdminPortal,
  finance: financePortal,
  iqac: iqacPortal,
  library: libraryPortal,
  parent: parentPortal,
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
  portal: PortalKey;
}) {
  const config = configs[portal];
  return (
    <AppShell config={config}>
      {children}
    </AppShell>
  );
}
