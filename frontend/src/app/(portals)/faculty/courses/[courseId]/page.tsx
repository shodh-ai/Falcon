'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyMetricChip,
  FacultyTabBar,
  FacultyErrorBanner,
} from '@/components/faculty';
import { FacultyMaterialsTab } from '@/components/lms/FacultyMaterialsTab';
import { FacultyAssignmentsTab } from '@/components/lms/FacultyAssignmentsTab';
import { FacultyAnnouncementsTab } from '@/components/lms/FacultyAnnouncementsTab';
import { LmsExtendedTabs } from '@/components/lms/LmsExtendedTabs';
import { useAuthedApi } from '@/lib/api';
import type { FacultyWorkspace } from '@/lib/api/lms';
import { withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoCourseWorkspace } from '@/lib/mock/faculty-portal-demo';

type WorkspaceTab = 'materials' | 'assignments' | 'announcements' | 'live';

function workspaceTabFromQuery(value: string | null): WorkspaceTab {
  if (value === 'assignments' || value === 'da') return 'assignments';
  if (value === 'announcements' || value === 'live') return value;
  return 'materials';
}

export default function FacultyCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const pathname = usePathname();
  const workspacePrefix = pathname.startsWith('/hod/') ? '/hod/academics' : '/faculty';
  const [workspace, setWorkspace] = useState<FacultyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = workspaceTabFromQuery(requestedTab);

  const load = useCallback(() => {
    if (!courseId) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    void api
      .get<FacultyWorkspace>(`/api/academics/faculty/courses/${courseId}/workspace`)
      .then((data) => {
        if (currentRequest !== requestId.current) return;
        setWorkspace(
          withFacultyDemoFallback(data, facultyDemoCourseWorkspace(courseId), (v) => !v?.modules?.length),
        );
      })
      .catch((err: unknown) => {
        if (currentRequest !== requestId.current) return;
        const fallback = withFacultyDemoFallback(null, facultyDemoCourseWorkspace(courseId));
        setWorkspace(fallback);
        if (!fallback) setError(err instanceof Error ? err.message : 'Failed to load course workspace');
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  }, [api, courseId]);

  useEffect(() => {
    // Clear the previous route's course while the new resource is being fetched.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace(null);
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  if (loading && !workspace) {
    return <FacultyPageLoading label="Loading course workspace…" branded />;
  }
  if (!workspace) {
    return (
      <FacultyPageShell>
        <FacultyErrorBanner message={error ?? 'Course workspace is unavailable.'} />
        <button type="button" onClick={load} className="text-sm font-medium underline">Retry</button>
        <Link href={`${workspacePrefix}/courses`} className="ml-4 text-sm font-medium underline">All courses</Link>
      </FacultyPageShell>
    );
  }

  const materialsCount = (workspace.modules ?? []).reduce(
    (sum, m) => sum + (m.materials?.length ?? 0),
    0,
  );

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Courses"
        description={`${workspace.course.course_name} — manage materials, assignments, and announcements.`}
        meta={
          <>
            <FacultyMetricChip label="Course" value={workspace.course.course_code} emphasis />
            <FacultyMetricChip label="Credits" value={workspace.course.credits} />
            <FacultyMetricChip label="Units" value={workspace.modules.length} />
            <FacultyMetricChip label="Materials" value={materialsCount} />
          </>
        }
        actions={
          <Link
            href={`${workspacePrefix}/courses`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sgvu-navy hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            All courses
          </Link>
        }
      />

      <CourseWorkspaceTabs
        key={`${courseId}:${requestedTab ?? ''}`}
        courseId={courseId}
        workspace={workspace}
        onRefresh={load}
        initialTab={initialTab}
      />
    </FacultyPageShell>
  );
}

function CourseWorkspaceTabs({ courseId, workspace, onRefresh, initialTab }: {
  courseId: string;
  workspace: FacultyWorkspace;
  onRefresh: () => void;
  initialTab: WorkspaceTab;
}) {
  const [tab, setTab] = useState(initialTab);

  return (
    <>
      <FacultyTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'materials', label: 'Reference materials' },
          { id: 'assignments', label: 'Digital assignments (DA)' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'live', label: 'Live & forum' },
        ]}
      />

      {tab === 'materials' ? (
        <FacultyMaterialsTab courseId={courseId} workspace={workspace} onRefresh={onRefresh} />
      ) : tab === 'assignments' ? (
        <FacultyAssignmentsTab courseId={courseId} />
      ) : tab === 'announcements' ? (
        <FacultyAnnouncementsTab courseId={courseId} />
      ) : (
        <LmsExtendedTabs courseId={courseId} mode="faculty" />
      )}
    </>
  );
}
