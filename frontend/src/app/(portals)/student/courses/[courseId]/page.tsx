'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, BookOpen } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CourseWorkspaceTabs } from '@/components/lms/CourseWorkspaceTabs';
import { StudentMaterialsTab } from '@/components/lms/StudentMaterialsTab';
import { StudentAssignmentsTab } from '@/components/lms/StudentAssignmentsTab';
import { StudentAnnouncementsTab } from '@/components/lms/StudentAnnouncementsTab';
import { LmsExtendedTabs } from '@/components/lms/LmsExtendedTabs';
import { useAuthedApi } from '@/lib/api';
import { withStudentReadTimeout } from '@/lib/student-read-request';
import type { StudentWorkspace } from '@/lib/api/lms';

const VALID_TABS = new Set(['materials', 'assignments', 'announcements', 'live']);

export default function StudentCourseWorkspacePage() {
  const { courseId } = useParams<{ courseId: string }>();
  return <StudentCourseWorkspace key={courseId} courseId={courseId} />;
}

function StudentCourseWorkspace({ courseId }: { courseId: string }) {
  const searchParams = useSearchParams();
  const api = useAuthedApi();
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    api: ReturnType<typeof useAuthedApi>;
    revision: number;
    data?: StudentWorkspace;
    failed?: boolean;
  } | null>(null);
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(() => (initialTab && VALID_TABS.has(initialTab) ? initialTab : 'materials'));

  const load = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    void withStudentReadTimeout(api.get<StudentWorkspace>(`/api/academics/student/courses/${courseId}/workspace`))
      .then((data) => {
        if (active) setResponse(data ? { api, revision, data } : { api, revision, failed: true });
      })
      .catch(() => {
        if (active) setResponse({ api, revision, failed: true });
      });
    return () => { active = false; };
  }, [api, courseId, revision]);

  if (response?.api !== api || response?.revision !== revision) {
    return <StudentLoadingState label="Loading course workspace…" />;
  }

  if (response.failed || !response.data) {
    return (
      <StudentPageShell width="5xl">
        <div role="alert">
          <StudentEmptyState
            icon={AlertCircle}
            title="Unable to load this course"
            description="Please try again. If the problem continues, return to your courses and contact Help & Support."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button type="button" onClick={load}>Try again</Button>
                <Button asChild variant="outline"><Link href="/student/courses">All courses</Link></Button>
              </div>
            }
          />
        </div>
      </StudentPageShell>
    );
  }

  const data = response.data;
  const { syllabus_progress: sp } = data;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title={`${data.course.course_code} — ${data.course.course_name}`}
        description="Course materials and digital assignments (VTOP-style LMS)."
        actions={
          <Link href="/student/courses" className="text-sm font-semibold text-sgvu-navy underline">
            All courses
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
          { id: 'announcements', label: 'Announcements' },
          { id: 'live', label: 'Live & forum' },
        ]}
      />

      {tab === 'materials' ? (
        <StudentMaterialsTab modules={data.modules} syllabusMaterials={data.syllabus_materials} />
      ) : tab === 'assignments' ? (
        <StudentAssignmentsTab assignments={data.assignments} onSubmitted={load} />
      ) : tab === 'announcements' ? (
        <StudentAnnouncementsTab courseId={courseId} />
      ) : (
        <LmsExtendedTabs courseId={courseId} mode="student" />
      )}
    </StudentPageShell>
  );
}
