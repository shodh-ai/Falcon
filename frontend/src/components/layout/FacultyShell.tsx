'use client';

import type { ReactNode } from 'react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { TeachingDepartmentSwitcher } from '@/components/layout/TeachingDepartmentSwitcher';
import {
  facultyPortal,
  filterFacultyPortalForManagerAccess,
  filterFacultyPortalForEventCoordinator,
  filterFacultyPortalForPlacementCoordinator,
} from '@/lib/navigation';
import { FACULTY_CONTENT_MAX_CLASS } from '@/components/faculty/FacultyPageShell';
import { TeachingDepartmentProvider } from '@/components/faculty/TeachingDepartmentContext';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';

function FacultyShellInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const api = useAuthedApi();
  const pathname = usePathname();
  const [isPlacementCoordinator, setIsPlacementCoordinator] = useState(false);
  const [isEventCoordinator, setIsEventCoordinator] = useState(false);

  useEffect(() => {
    void api
      .get<{ is_coordinator: boolean }>('/api/academics/faculty/placement/coordinator-status')
      .then((res) => setIsPlacementCoordinator(res.is_coordinator))
      .catch(() => setIsPlacementCoordinator(false));
  }, [api]);

  useEffect(() => {
    void api
      .get<{ is_coordinator: boolean }>('/api/campus-events/me/faculty-coordinator')
      .then((res) => setIsEventCoordinator(res.is_coordinator))
      .catch(() => setIsEventCoordinator(false));
  }, [api]);

  const config = useMemo(() => {
    let next = filterFacultyPortalForManagerAccess(facultyPortal, canSeeFacultyTeamApprovals(user));
    next = filterFacultyPortalForPlacementCoordinator(next, isPlacementCoordinator);
    next = filterFacultyPortalForEventCoordinator(next, isEventCoordinator);
    return next;
  }, [user, isPlacementCoordinator, isEventCoordinator]);

  const contentMaxWidthClass =
    pathname?.startsWith('/faculty/ai-assistant') || pathname?.startsWith('/faculty/dashboard')
      ? 'max-w-[1400px]'
      : FACULTY_CONTENT_MAX_CLASS;

  return (
    <AppShell
      config={config}
      contentMaxWidthClass={contentMaxWidthClass}
      headerExtra={<TeachingDepartmentSwitcher />}
    >
      {children}
    </AppShell>
  );
}

export function FacultyShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <TeachingDepartmentProvider>
        <FacultyShellInner>{children}</FacultyShellInner>
      </TeachingDepartmentProvider>
    </Suspense>
  );
}
