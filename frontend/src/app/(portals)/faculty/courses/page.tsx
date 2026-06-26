'use client';

import Link from 'next/link';
import { BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
  FacultyErrorBanner,
} from '@/components/faculty';
import { Badge } from '@/components/ui/badge';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';

export default function FacultyCoursesIndexPage() {
  const { courses, loading, error } = useFacultyCourses();

  const totalCredits = courses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
  const isFetchError = error && error !== 'No courses allocated to your timetable yet.';

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Open a subject to plan syllabus modules, track coverage, upload materials, and manage digital assignments."
        meta={
          !loading && courses.length > 0 ? (
            <>
              <FacultyMetricChip label="Courses" value={courses.length} emphasis />
              <FacultyMetricChip label="Total credits" value={totalCredits} />
            </>
          ) : null
        }
      />

      {loading ? (
        <FacultyPageLoading label="Loading courses…" />
      ) : courses.length === 0 ? (
        isFetchError ? (
          <FacultyErrorBanner message={error!} />
        ) : (
          <FacultyEmptyState
            title="No courses assigned"
            description="When courses are allocated to your timetable, they will appear here as workspaces."
          />
        )
      ) : (
        <FacultyPanel
          title="Your course workspaces"
          count={courses.length}
          description="Syllabus, materials, assignments, and live sessions"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <Link
                key={c.allocation_id ?? c.course_id}
                href={`/faculty/courses/${c.course_id}`}
                className="group flex items-start gap-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy group-hover:bg-sgvu-gold/15">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-sgvu-navy">{c.course_code}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.credits} credits
                    </Badge>
                    {c.semester ? (
                      <Badge variant="outline" className="text-[10px]">
                        {c.semester}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{c.course_name}</p>
                  {c.program_name ? (
                    <p className="mt-1 text-xs text-muted-foreground">{c.program_name}</p>
                  ) : null}
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
        </FacultyPanel>
      )}
    </FacultyPageShell>
  );
}
