'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ParentChildProvider } from '@/context/ParentChildContext';
import { ParentChildSwitcher } from '@/components/parent/ParentChildSwitcher';
import { parentPortal } from '@/lib/navigation';

export function ParentShell({ children }: { children: ReactNode }) {
  return (
    <ParentChildProvider>
      <AppShell
        config={parentPortal}
        profileHref="/parent/dashboard"
        headerExtra={<ParentChildSwitcher variant="header" />}
      >
        {children}
      </AppShell>
    </ParentChildProvider>
  );
}
