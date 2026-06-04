'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { PortalConfig } from '@/lib/navigation';
import { LayoutDashboard, Network, UserCog } from 'lucide-react';

const superAdminPortal: PortalConfig = {
  personaLabel: 'Master Admin',
  personaTitle: 'God-mode governance',
  homeHref: '/super-admin/dashboard',
  navGroups: [
    {
      title: 'Control',
      items: [
        { label: 'Dashboard', href: '/super-admin/dashboard', icon: LayoutDashboard },
        { label: 'Hierarchy', href: '/super-admin/hierarchy', icon: Network },
        { label: 'Impersonation', href: '/super-admin/impersonation', icon: UserCog },
      ],
    },
  ],
  commandItems: [],
};

export function SuperAdminShell({ children }: { children: ReactNode }) {
  return <AppShell config={superAdminPortal}>{children}</AppShell>;
}
