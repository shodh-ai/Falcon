'use client';

import type { ReactNode } from 'react';
import { LeadershipIntelligenceProvider } from '@/components/leadership/intelligence/LeadershipIntelligenceProvider';
import { LeadershipPortalShell } from '@/components/leadership/LeadershipPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';

export default function LeadershipLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <LeadershipIntelligenceProvider>
        <LeadershipPortalShell>{children}</LeadershipPortalShell>
      </LeadershipIntelligenceProvider>
    </RoleGate>
  );
}
