'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { CampusAdminShell } from '@/components/layout/CampusAdminShell';
import { AppShell } from '@/components/layout/AppShell';
import { usesManagementAdminSidebar } from '@/components/layout/RoleAwareShell';
import { campusAdminRoutes, normalizeRoleName } from '@/lib/campus-admin.roles';
import { useAuth } from '@/context/AuthContext';
import {
  CalendarDays,
  FileCheck2,
  Kanban,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import type { PortalConfig } from '@/lib/navigation';

function admissionsOfficerPortal(): PortalConfig {
  return {
    personaLabel: 'Admissions Officer',
    personaTitle: 'Admissions CRM',
    homeHref: campusAdminRoutes.admissionsKanban,
    includeAccountSettingsNav: false,
    hideWorkspaceSwitcher: true,
    navGroups: [
      {
        title: 'Admissions',
        items: [
          { label: 'Kanban Board', href: '/admissions-crm/pipeline', icon: Kanban },
          { label: 'Verifications', href: '/admissions-crm/verifications', icon: FileCheck2 },
          { label: 'Counselling', href: '/admissions-crm/counseling', icon: Users },
          { label: 'Enrolled Students', href: '/admissions-crm/enrolled-students', icon: Users },
          { label: 'Dashboard', href: '/admissions-crm/dashboard', icon: LayoutDashboard },
          { label: 'My leave', href: '/admissions-crm/leaves', icon: CalendarDays },
        ],
      },
    ],
    commandItems: [],
  };
}

export function AdmissionsCrmShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = normalizeRoleName(user?.primaryRole ?? user?.role ?? '');
  if (role === 'registrar') return <AdminShell>{children}</AdminShell>;
  if (role === 'campusadmin') return <CampusAdminShell>{children}</CampusAdminShell>;
  if (role === 'admissionsofficer') {
    return <AppShell config={admissionsOfficerPortal()}>{children}</AppShell>;
  }
  if (usesManagementAdminSidebar(user?.primaryRole ?? user?.role)) {
    return <AdminShell>{children}</AdminShell>;
  }
  return <CampusAdminShell>{children}</CampusAdminShell>;
}

export { CampusAdminShell } from '@/components/layout/CampusAdminShell';
export { SuperAdminShell } from '@/components/layout/SuperAdminShell';
