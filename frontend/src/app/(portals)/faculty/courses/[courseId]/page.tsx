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
import { LmsExtendedTabs } from '@/components/lms/LmsExtendedTabs';
import { useAuthedApi } from '@/lib/api';
import type { FacultyWorkspace } from '@/lib/api/lms';

type WorkspaceTab = 'materials' | 'assignments' | 'live';

export default function FacultyCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const [workspace, setWorkspace] = useState<FacultyWorkspace | null>(null);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<WorkspaceTab>('materials');

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'assignments' || t === 'da') setTab('assignments');
  }, [searchParams]);

  const load = useCallback(() => {
    if (!courseId) return;
    void api.get<FacultyWorkspace>(`/api/academics/faculty/courses/${courseId}/workspace`).then(setWorkspace);
  }, [api, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!workspace) {
    return <FacultyPageLoading label="Loading course workspace…" branded />;
  }

  const materialsCount = workspace.modules.reduce((sum, m) => sum + m.materials.length, 0);

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description={`${workspace.course.course_name} — reference materials (notes/PPT) and digital assignments (DA).`}
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
          { id: 'live', label: 'Live & forum' },
        ]}
      />

      {tab === 'materials' ? (
        <FacultyMaterialsTab courseId={courseId!} workspace={workspace} onRefresh={load} />
      ) : tab === 'assignments' ? (
        <FacultyAssignmentsTab courseId={courseId!} />
      ) : (
        <LmsExtendedTabs courseId={courseId!} mode="faculty" />
      )}
    </FacultyPageShell>
  );
}
