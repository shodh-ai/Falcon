'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ChairmanQuickActions } from '@/components/leadership/ChairmanQuickActions';
import { leadershipPortal, operationsPortal, type PortalConfig } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';

function portalConfigForLeadershipUser(role: string): PortalConfig {
  const r = role.trim().toLowerCase();
  if (r === 'coo') return operationsPortal;
  return leadershipPortal;
}

export function LeadershipPortalShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role ?? 'Chairman';
  const isChairman = role.trim().toLowerCase() === 'chairman';
  const shellConfig = portalConfigForLeadershipUser(role);

  return (
    <>
      <AppShell
        config={shellConfig}
        contentMaxWidthClass="max-w-7xl"
        headerExtra={isChairman ? <ChairmanQuickActions variant="header" /> : undefined}
      >
        {children}
      </AppShell>
      {isChairman ? <ChairmanQuickActions variant="fab" /> : null}
    </>
  );
}
