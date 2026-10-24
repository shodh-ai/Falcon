'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { studentPortal } from '@/lib/navigation';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi } from '@/lib/api/api.campus-events';
import type { PortalConfig } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';
import { useModuleRuntime } from '@/context/ModuleRuntimeContext';
import { resolveUserRoleList } from '@/lib/available-workspaces';
import { filterStudentPortalConfigForRoles, getStudentLandingPath } from '@/lib/student-access';
import { Button } from '@/components/ui/button';

export function StudentShell({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return <StudentShellWorkspace key={token}>{children}</StudentShellWorkspace>;
}

function StudentShellWorkspace({ children }: { children: ReactNode }) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const roles = resolveUserRoleList(user);
  const student = roles.some((role) => role.toLowerCase() === 'student');
  const { module: runtimeModule } = useModuleRuntime();
  const bootstrapEnabled = student && runtimeModule('sis_academics')?.available !== false;
  const eventsEnabled = student && runtimeModule('campus_operations')?.available !== false;
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    if (!bootstrapEnabled) return;
    let cancelled = false;
    void api.post('/api/student/portal-bootstrap', {})
      .then(() => { if (!cancelled) setBootstrapError(false); })
      .catch(() => { if (!cancelled) setBootstrapError(true); });
    return () => { cancelled = true; };
  }, [api, bootstrapEnabled, bootstrapAttempt]);

  useEffect(() => {
    if (!eventsEnabled) return;
    let cancelled = false;
    void eventsApi
      .isClubCoordinator()
      .then((r) => { if (!cancelled) setIsCoordinator(r.is_coordinator); })
      .catch(() => { if (!cancelled) setIsCoordinator(false); });
    return () => { cancelled = true; };
  }, [eventsApi, eventsEnabled]);

  const config: PortalConfig = useMemo(() => {
    const base = {
      ...filterStudentPortalConfigForRoles(studentPortal, resolveUserRoleList(user)),
      homeHref: getStudentLandingPath(resolveUserRoleList(user)),
    };
    if (!isCoordinator || !eventsEnabled) return base;
    const clubItem = {
      label: 'My Clubs',
      href: '/student/club-management',
      icon: Users,
      keywords: ['events', 'club', 'coordinator', 'club management'],
    };
    return {
      ...base,
      navGroups: base.navGroups.map((g) =>
        g.title === 'Campus Services' ? { ...g, items: [...g.items, clubItem] } : g,
      ),
      commandItems: [...base.commandItems, clubItem],
    };
  }, [isCoordinator, eventsEnabled, user]);

  return (
    <AppShell config={config} profileHref="/student/profile">
      {bootstrapEnabled && bootstrapError ? (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>Course enrollment sync is unavailable. Some academic records may be incomplete.</p>
          <Button variant="outline" size="sm" onClick={() => {
            setBootstrapError(false);
            setBootstrapAttempt((attempt) => attempt + 1);
          }}>Retry enrollment sync</Button>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
