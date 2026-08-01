'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { adminPortal } from '@/lib/navigation';

/**
 * Management console shell.
 * Uses the full adminPortal Modules list on every /admin/* route so the
 * sidebar matches /directory (which also renders adminPortal unfiltered).
 * Route access remains enforced by RoleGate / API guards — not by hiding links.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return <AppShell config={adminPortal}>{children}</AppShell>;
}
