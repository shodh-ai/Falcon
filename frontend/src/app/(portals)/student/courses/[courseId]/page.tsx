'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CourseWorkspaceTabs } from '@/components/lms/CourseWorkspaceTabs';
import { StudentMaterialsTab } from '@/components/lms/StudentMaterialsTab';
import { StudentAssignmentsTab } from '@/components/lms/StudentAssignmentsTab';
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
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading course…</p>;
  }

  const { syllabus_progress: sp } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title={`${data.course.course_code} — ${data.course.course_name}`}
        description="Course materials and digital assignments (VTOP-style LMS)."
        actions={
          <Link href="/student/registration" className="text-sm font-medium text-sgvu-navy underline">
            My subjects
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Syllabus progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm font-medium">
            {sp.percent}% ({sp.completed}/{sp.total} units)
          </p>
          <Progress value={sp.percent} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Attendance: {data.enrollment.attendance_percent}%
          </p>
        </CardContent>
      </Card>

      <CourseWorkspaceTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'materials', label: 'Course materials' },
          { id: 'assignments', label: 'Digital assignments (DA)' },
        ]}
      />

      {tab === 'materials' ? (
        <StudentMaterialsTab modules={data.modules} />
      ) : (
        <StudentAssignmentsTab assignments={data.assignments} onSubmitted={load} />
      )}
    </div>
  );
}
