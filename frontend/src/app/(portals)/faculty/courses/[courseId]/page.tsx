'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyMetricChip,
  FacultyTabBar,
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

export default function FacultyCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const [workspace, setWorkspace] = useState<FacultyWorkspace | null>(null);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<WorkspaceTab>('materials');

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'materials') setTab('materials');
    if (t === 'assignments' || t === 'da') setTab('assignments');
    if (t === 'announcements') setTab('announcements');
    if (t === 'live') setTab('live');
  }, [searchParams]);

  const load = useCallback(() => {
    if (!courseId) return;
    void api
      .get<FacultyWorkspace>(`/api/academics/faculty/courses/${courseId}/workspace`)
      .then((data) =>
        setWorkspace(
          withFacultyDemoFallback(data, facultyDemoCourseWorkspace(courseId), (v) => !v?.modules?.length),
        ),
      )
      .catch(() =>
        setWorkspace(withFacultyDemoFallback(null, facultyDemoCourseWorkspace(courseId))),
      );
  }, [api, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!workspace) {
    return <FacultyPageLoading label="Loading course workspace…" branded />;
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
            href="/faculty/courses"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sgvu-navy hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            All courses
          </Link>
        }
      />

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
        <FacultyMaterialsTab courseId={courseId!} workspace={workspace} onRefresh={load} />
      ) : tab === 'assignments' ? (
        <FacultyAssignmentsTab courseId={courseId!} />
      ) : tab === 'announcements' ? (
        <FacultyAnnouncementsTab courseId={courseId!} />
      ) : (
        <LmsExtendedTabs courseId={courseId!} mode="faculty" />
      )}
    </FacultyPageShell>
  );
}
