'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { PortalConfig } from '@/lib/navigation';
import { Kanban, Users } from 'lucide-react';

const admissionsCrmPortal: PortalConfig = {
  personaLabel: 'Admissions CRM',
  personaTitle: 'Lead funnel & counselor workspace',
  homeHref: '/admissions-crm/pipeline',
  navGroups: [
    {
      title: 'Pipeline',
      items: [
        { label: 'Kanban board', href: '/admissions-crm/pipeline', icon: Kanban },
        { label: 'Enrolled Students', href: '/admissions-crm/enrolled-students', icon: Users },
      ],
    },
  ],
  commandItems: [],
};

export function AdmissionsCrmShell({ children }: { children: ReactNode }) {
  return <AppShell config={admissionsCrmPortal}>{children}</AppShell>;
}
