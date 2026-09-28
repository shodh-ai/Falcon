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
  filterFacultyPortalForPhdGuide,
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
  const [isPhdGuide, setIsPhdGuide] = useState(false);

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

  useEffect(() => {
    void api
      .get<unknown[]>('/api/phd-lifecycle/guide/scholars')
      .then((rows) => setIsPhdGuide(Array.isArray(rows) && rows.length > 0))
      .catch(() => setIsPhdGuide(false));
  }, [api]);

  const config = useMemo(() => {
    let next = filterFacultyPortalForManagerAccess(facultyPortal, canSeeFacultyTeamApprovals(user));
    next = filterFacultyPortalForPlacementCoordinator(next, isPlacementCoordinator);
    next = filterFacultyPortalForEventCoordinator(next, isEventCoordinator);
    next = filterFacultyPortalForPhdGuide(next, isPhdGuide);
    return next;
  }, [user, isPlacementCoordinator, isEventCoordinator, isPhdGuide]);

  const contentMaxWidthClass =
    pathname?.startsWith('/faculty/analytics')
      ? 'max-w-[1600px]'
      : pathname?.startsWith('/faculty/ai-assistant') || pathname?.startsWith('/faculty/dashboard')
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
