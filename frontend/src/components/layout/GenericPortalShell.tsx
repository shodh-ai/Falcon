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
} from '@/lib/navigation';

type PortalKey = 'hod' | 'hostel-admin' | 'finance' | 'iqac' | 'library' | 'president' | 'parent' | 'exam-cell';

const configs = {
  hod: hodPortal,
  'hostel-admin': hostelAdminPortal,
  finance: financePortal,
  iqac: iqacPortal,
  library: libraryPortal,
  parent: parentPortal,
  'exam-cell': examCellPortal,
  president: presidentPortal,
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
    <AppShell config={config} notifications={[]} profileHref={config.homeHref}>
      {children}
    </AppShell>
  );
}
