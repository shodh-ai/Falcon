'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { hrPortal } from '@/lib/navigation';

export function HrShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={hrPortal} profileHref="/hr/dashboard">
      {children}
    </AppShell>
  );
}
