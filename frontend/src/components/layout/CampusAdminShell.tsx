'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { PortalConfig } from '@/lib/navigation';
import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  Kanban,
  LayoutDashboard,
  Network,
  Scale,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { StaffLeaveStatusBanner } from '@/components/self-service/StaffLeaveStatusBanner';
import { AdmissionsLeaveNotificationListener } from '@/components/self-service/AdmissionsLeaveNotificationListener';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { CAMPUS_ADMIN_LOGIN_EMAIL } from '@/lib/campus-admin.roles';

const ENTITY_CREATOR_EMAIL = CAMPUS_ADMIN_LOGIN_EMAIL;

export function CampusAdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isEntityCreator =
    (user?.email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL;

  const campusAdminPortal: PortalConfig = {
    personaLabel: 'Campus Admin',
    personaTitle: 'Platform governance & admissions',
    homeHref: campusAdminRoutes.dashboard,
    includeAccountSettingsNav: false,
    hideWorkspaceSwitcher: true,
    navGroups: [
      {
        title: 'Platform',
        items: [
          { label: 'Dashboard', href: campusAdminRoutes.dashboard, icon: LayoutDashboard },
          ...(isEntityCreator
            ? [{ label: 'Entities', href: campusAdminRoutes.entities, icon: Building2 }]
            : []),
          { label: 'Hierarchy', href: campusAdminRoutes.hierarchy, icon: Network },
          { label: 'Impersonation', href: campusAdminRoutes.impersonation, icon: UserCog },
          { label: 'Override Logs', href: campusAdminRoutes.overrideLogs, icon: ClipboardList },
          { label: 'Master Settings', href: campusAdminRoutes.settings, icon: Settings },
          {
            label: 'DOFA Policy Vault',
            href: '/admin/dofa-policy-vault',
            icon: Scale,
            keywords: ['constitution', 'dual-key', 'workflow', 'policy vault', 'dofa'],
          },
        ],
      },
      {
        title: 'Admissions',
        items: [
          { label: 'Kanban board', href: campusAdminRoutes.admissionsPipeline, icon: Kanban },
          {
            label: 'Verifications',
            href: campusAdminRoutes.admissionsVerifications,
            icon: FileCheck2,
          },
          {
            label: 'Enrolled Students',
            href: campusAdminRoutes.admissionsEnrolledStudents,
            icon: Users,
          },
          {
            label: 'Counseling',
            href: campusAdminRoutes.admissionsCounseling,
            icon: Users,
          },
          { label: 'My leave', href: campusAdminRoutes.admissionsLeaves, icon: CalendarDays },
        ],
      },
    ],
    commandItems: [
      {
        label: 'DOFA Policy Vault',
        href: '/admin/dofa-policy-vault',
        icon: Scale,
        keywords: ['constitution', 'dual-key', 'policy vault', 'dofa'],
      },
    ],
  };

  return (
    <AppShell config={campusAdminPortal}>
      <AdmissionsLeaveNotificationListener />
      <StaffLeaveStatusBanner statusPath={campusAdminRoutes.admissionsLeaves} />
      {children}
    </AppShell>
  );
}

/** @deprecated Use CampusAdminShell */
export function SuperAdminShell({ children }: { children: ReactNode }) {
  return <CampusAdminShell>{children}</CampusAdminShell>;
}

/** @deprecated Use CampusAdminShell */
export function AdmissionsCrmShell({ children }: { children: ReactNode }) {
  return <CampusAdminShell>{children}</CampusAdminShell>;
}
