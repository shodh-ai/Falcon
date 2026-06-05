'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Progress } from '@/components/ui/progress';
import { CourseWorkspaceTabs } from '@/components/lms/CourseWorkspaceTabs';
import { StudentMaterialsTab } from '@/components/lms/StudentMaterialsTab';
import { StudentAssignmentsTab } from '@/components/lms/StudentAssignmentsTab';
import { LmsExtendedTabs } from '@/components/lms/LmsExtendedTabs';
import { useAuthedApi } from '@/lib/api';
import type { StudentWorkspace } from '@/lib/api/lms';

export default function StudentCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const api = useAuthedApi();
  const [data, setData] = useState<StudentWorkspace | null>(null);
  const [tab, setTab] = useState('materials');

  const load = useCallback(() => {
    if (!courseId) return;
    void api.get<StudentWorkspace>(`/api/academics/student/courses/${courseId}/workspace`).then(setData);
  }, [api, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return <StudentLoadingState label="Loading course workspace…" />;
  }

  const { syllabus_progress: sp } = data;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title={`${data.course.course_code} — ${data.course.course_name}`}
        description="Course materials and digital assignments (VTOP-style LMS)."
        actions={
          <Link href="/student/registration" className="text-sm font-semibold text-sgvu-navy underline">
            My subjects
          </Link>
        }
      />

      <StudentSectionCard title="Syllabus progress" description="Units completed and attendance snapshot" icon={BookOpen} tone="gold">
        <p className="mb-2 text-sm font-semibold text-sgvu-navy">
          {sp.percent}% complete ({sp.completed}/{sp.total} units)
        </p>
        <Progress value={sp.percent} className="h-2.5" />
        <p className="mt-2 text-xs text-muted-foreground">Attendance: {data.enrollment.attendance_percent}%</p>
      </StudentSectionCard>

      <CourseWorkspaceTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'materials', label: 'Course materials' },
          { id: 'assignments', label: 'Digital assignments (DA)' },
          { id: 'live', label: 'Live & forum' },
        ]}
      />

      {tab === 'materials' ? (
        <StudentMaterialsTab modules={data.modules} />
      ) : tab === 'assignments' ? (
        <StudentAssignmentsTab assignments={data.assignments} onSubmitted={load} />
      ) : (
        <LmsExtendedTabs courseId={courseId!} mode="student" />
      )}
    </StudentPageShell>
  );
}
