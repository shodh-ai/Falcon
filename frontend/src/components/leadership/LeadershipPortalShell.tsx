'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ChairmanQuickActions } from '@/components/leadership/ChairmanQuickActions';
import { leadershipPortal } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';

export function LeadershipPortalShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isChairman = (user?.primaryRole ?? user?.role ?? '').toLowerCase() === 'chairman';

  return (
    <>
      <AppShell
        config={leadershipPortal}
        contentMaxWidthClass="max-w-7xl"
        headerExtra={isChairman ? <ChairmanQuickActions variant="header" /> : undefined}
      >
        {children}
      </AppShell>
      {isChairman ? <ChairmanQuickActions variant="fab" /> : null}
    </>
  );
}
