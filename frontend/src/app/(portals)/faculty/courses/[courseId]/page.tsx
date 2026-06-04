'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { CourseWorkspaceTabs } from '@/components/lms/CourseWorkspaceTabs';
import { FacultyMaterialsTab } from '@/components/lms/FacultyMaterialsTab';
import { FacultyAssignmentsTab } from '@/components/lms/FacultyAssignmentsTab';
import { LmsExtendedTabs } from '@/components/lms/LmsExtendedTabs';
import { useAuthedApi } from '@/lib/api';
import type { FacultyWorkspace } from '@/lib/api/lms';

export default function FacultyCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const [workspace, setWorkspace] = useState<FacultyWorkspace | null>(null);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState('materials');

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
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading course workspace…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title={`${workspace.course.course_code} — ${workspace.course.course_name}`}
        description="Reference materials (notes/PPT) and digital assignments (DA) for this subject."
        actions={
          <Link href="/faculty/courses" className="text-sm font-medium text-sgvu-navy underline">
            All courses
          </Link>
        }
      />

      <CourseWorkspaceTabs
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
    </div>
  );
}
