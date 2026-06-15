'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { leadershipPortal } from '@/lib/navigation';

export function LeadershipPortalShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={leadershipPortal} profileHref={leadershipPortal.homeHref}>
      {children}
    </AppShell>
  );
}
