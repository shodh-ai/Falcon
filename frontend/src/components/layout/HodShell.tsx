'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { hodPortal } from '@/lib/navigation';

export function HodShell({ children }: { children: ReactNode }) {
  return <AppShell config={hodPortal}>{children}</AppShell>;
}
