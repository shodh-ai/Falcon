'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { PortalConfig } from '@/lib/navigation';
import { Building2, LayoutDashboard, Network, UserCog, ClipboardList, Settings, BookOpen } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const ENTITY_CREATOR_EMAIL = 'superadmin@mygyanvihar.com';

export function SuperAdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isEntityCreator = (user?.email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL;

  const superAdminPortal: PortalConfig = {
    personaLabel: 'Master Admin',
    personaTitle: 'God-mode governance',
    homeHref: '/super-admin/dashboard',
    navGroups: [
      {
        title: 'Control',
        items: [
          { label: 'Dashboard', href: '/super-admin/dashboard', icon: LayoutDashboard },
          ...(isEntityCreator
            ? [{ label: 'Entities', href: '/super-admin/entities', icon: Building2 }]
            : []),
          { label: 'Hierarchy', href: '/super-admin/hierarchy', icon: Network },
          { label: 'Impersonation', href: '/super-admin/impersonation', icon: UserCog },
          { label: 'Override Logs', href: '/super-admin/override-logs', icon: ClipboardList },
          { label: 'Course Mapper', href: '/super-admin/academics/course-mapper', icon: BookOpen },
          { label: 'Master Settings', href: '/super-admin/settings', icon: Settings },
        ],
      },
    ],
    commandItems: [],
  };

  return <AppShell config={superAdminPortal}>{children}</AppShell>;
}
