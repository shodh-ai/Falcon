'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { studentPortal } from '@/lib/navigation';
import { StudentFaqChat } from '@/components/student/StudentFaqChat';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi } from '@/lib/api/api.campus-events';
import type { PortalConfig } from '@/lib/navigation';

export function StudentShell({ children }: { children: ReactNode }) {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [isCoordinator, setIsCoordinator] = useState(false);

  useEffect(() => {
    void eventsApi
      .isClubCoordinator()
      .then((r) => setIsCoordinator(r.is_coordinator))
      .catch(() => setIsCoordinator(false));
  }, [eventsApi]);

  const config: PortalConfig = useMemo(() => {
    if (!isCoordinator) return studentPortal;
    const clubItem = {
      label: 'Club Management',
      href: '/student/club-management',
      icon: Users,
      keywords: ['events', 'club', 'coordinator'],
    };
    return {
      ...studentPortal,
      navGroups: studentPortal.navGroups.map((g) =>
        g.title === 'Campus Services' ? { ...g, items: [...g.items, clubItem] } : g,
      ),
      commandItems: [...studentPortal.commandItems, clubItem],
    };
  }, [isCoordinator]);

  return (
    <AppShell config={config} profileHref="/student/profile">
      {children}
      <StudentFaqChat />
    </AppShell>
  );
}
