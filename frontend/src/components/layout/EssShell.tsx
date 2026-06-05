'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { HrEntityProvider } from '@/context/HrEntityContext';
import { essPortal } from '@/lib/navigation';

export function EssShell({ children }: { children: ReactNode }) {
  return (
    <HrEntityProvider>
      <AppShell config={essPortal} profileHref="/ess/calendar">
        {children}
      </AppShell>
    </HrEntityProvider>
  );
}
