'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { StaffLeaveStatusBanner } from '@/components/self-service/StaffLeaveStatusBanner';
import { AdmissionsLeaveNotificationListener } from '@/components/self-service/AdmissionsLeaveNotificationListener';
import type { PortalConfig } from '@/lib/navigation';
import { CalendarDays, FileCheck2, Kanban, Users } from 'lucide-react';

const admissionsCrmPortal: PortalConfig = {
  personaLabel: 'Admissions CRM',
  personaTitle: 'Lead funnel & counselor workspace',
  homeHref: '/admissions-crm/pipeline',
  navGroups: [
    {
      title: 'Pipeline',
      items: [
        { label: 'Kanban board', href: '/admissions-crm/pipeline', icon: Kanban },
        { label: 'Verifications', href: '/admissions-crm/verifications', icon: FileCheck2 },
        { label: 'Enrolled Students', href: '/admissions-crm/enrolled-students', icon: Users },
        { label: 'My leave', href: '/admissions-crm/leaves', icon: CalendarDays },
      ],
    },
  ],
  commandItems: [],
};

export function AdmissionsCrmShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={admissionsCrmPortal}>
      <AdmissionsLeaveNotificationListener />
      <StaffLeaveStatusBanner statusPath="/admissions-crm/leaves" />
      {children}
    </AppShell>
  );
}
