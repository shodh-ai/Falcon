'use client';

import Link from 'next/link';
import { BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { StudentLiveClassUpdates } from '@/components/lms/StudentLiveClassUpdates';
import { useStudentCourses } from '@/components/student/useStudentCourses';

export default function StudentCoursesIndexPage() {
  const { courses, currentSemester, loading, error } = useStudentCourses();

  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
  const isFetchError = error && error !== 'No subjects enrolled for this semester yet.';

  if (loading) {
    return <StudentLoadingState label="Loading your courses…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Course Page & DA"
        description="Open a subject for course materials, digital assignments (DA), and live sessions."
        actions={
          currentSemester != null ? (
            <Badge variant="secondary" className="text-xs">
              Semester {currentSemester}
            </Badge>
          ) : null
        }
      />

      <StudentLiveClassUpdates />

      {courses.length === 0 ? (
        isFetchError ? (
          <StudentEmptyState title="Could not load courses" description={error!} />
        ) : (
          <StudentEmptyState
            title="No enrolled subjects"
            description="Subjects appear here once you are registered for the current semester."
            action={
              <Link href="/student/registration" className="text-sm font-semibold text-sgvu-navy underline">
                Go to CBCS registration
              </Link>
            }
          />
        )
      ) : (
        <StudentSectionCard
          title="Your course workspaces"
          description={`${courses.length} subject${courses.length === 1 ? '' : 's'} · ${totalCredits} credits this semester`}
          icon={BookOpen}
          tone="gold"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <Link
                key={c.course_id}
                href={`/student/courses/${c.course_id}`}
                className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy group-hover:bg-sgvu-gold/15">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sgvu-navy">{c.course_code}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.credits} cr
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {c.course_type}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{c.course_name}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs font-medium text-sgvu-navy/70 group-hover:text-sgvu-navy">
                    Open workspace
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <GraduationCap className="h-4 w-4 shrink-0 text-sgvu-gold" />
            <span>
              Each workspace includes reference materials, digital assignments (DA), and live & forum tabs.
            </span>
          </div>
        </StudentSectionCard>
      )}
    </StudentPageShell>
  );
}
