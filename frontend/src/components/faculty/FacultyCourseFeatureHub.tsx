'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Search } from 'lucide-react';
import {
  FacultyEmptyState,
  FacultyErrorBanner,
  FacultyMetricChip,
  FacultyPageHeader,
  FacultyPageLoading,
  FacultyPageShell,
  FacultyPanel,
} from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { useOptionalTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { FacultyAnnouncementsTab } from '@/components/lms/FacultyAnnouncementsTab';
import { FacultyAssignmentsTab } from '@/components/lms/FacultyAssignmentsTab';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export type FacultyCourseFeature = 'assignments' | 'materials' | 'announcements';

const META: Record<
  FacultyCourseFeature,
  { title: string; description: string; tab: string; workspaceLabel: string }
> = {
  assignments: {
    title: 'Assignments',
    description: 'Create, grade, and return digital assignments (DA) for each allocated course.',
    tab: 'assignments',
    workspaceLabel: 'Open assignment desk',
  },
  materials: {
    title: 'Study Materials',
    description: 'Upload syllabus, modules, and reference materials students can download.',
    tab: 'materials',
    workspaceLabel: 'Open materials desk',
  },
  announcements: {
    title: 'Announcements',
    description: 'Publish course announcements and notify enrolled students.',
    tab: 'announcements',
    workspaceLabel: 'Open announcements',
  },
};

export function FacultyCourseFeatureHub({ feature }: { feature: FacultyCourseFeature }) {
  const meta = META[feature];
  const { courses, loading, error } = useFacultyCourses();
  const teachingDept = useOptionalTeachingDepartment();
  const activeDepartment = teachingDept?.activeDepartment;
  const isMultiDepartment = teachingDept?.isMultiDepartment ?? false;
  const [search, setSearch] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.course_code.toLowerCase().includes(q) ||
        c.course_name.toLowerCase().includes(q) ||
        (c.program_name ?? '').toLowerCase().includes(q),
    );
  }, [courses, search]);

  const selected =
    filtered.find((c) => c.course_id === selectedCourseId) ??
    courses.find((c) => c.course_id === selectedCourseId) ??
    null;

  const isFetchError = error && error !== 'No courses allocated to your timetable yet.';

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title={meta.title}
        description={
          isMultiDepartment && activeDepartment
            ? `${meta.description} Showing ${activeDepartment.dept_name}.`
            : meta.description
        }
        meta={
          !loading && courses.length > 0 ? (
            <FacultyMetricChip label="Courses" value={courses.length} emphasis />
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
            description="When courses are allocated to your timetable, they will appear here."
          />
        )
      ) : (
        <>
          <FacultyPanel title="Select a course" description="Jump into the workspace tab for this feature">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search courses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm sm:w-72"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                <option value="">Choose course…</option>
                {filtered.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_code} — {c.course_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
                <div key={c.course_id} className="flex flex-col rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <p className="font-bold text-sgvu-navy">{c.course_code}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.credits} credits
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.course_name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-sgvu-navy/20 bg-sgvu-navy px-2.5 py-1.5 text-xs font-semibold text-white"
                      onClick={() => setSelectedCourseId(c.course_id)}
                    >
                      Work here
                    </button>
                    <Link
                      href={`/faculty/courses/${c.course_id}?tab=${meta.tab}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2.5 py-1.5 text-xs font-semibold text-sgvu-navy hover:bg-sgvu-gold/10"
                    >
                      {meta.workspaceLabel}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </FacultyPanel>

          {selected && feature === 'assignments' ? (
            <FacultyPanel
              title={`${selected.course_code} — Assignments`}
              description={selected.course_name}
            >
              <FacultyAssignmentsTab courseId={selected.course_id} />
            </FacultyPanel>
          ) : null}

          {selected && feature === 'announcements' ? (
            <FacultyPanel
              title={`${selected.course_code} — Announcements`}
              description={selected.course_name}
            >
              <FacultyAnnouncementsTab courseId={selected.course_id} />
            </FacultyPanel>
          ) : null}

          {selected && feature === 'materials' ? (
            <FacultyPanel
              title={`${selected.course_code} — Study materials`}
              description="Open the full workspace to upload modules, files, and syllabus."
            >
              <Link
                href={`/faculty/courses/${selected.course_id}?tab=materials`}
                className="inline-flex items-center gap-2 rounded-lg border border-sgvu-navy/20 bg-sgvu-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#123A6D]"
              >
                Open materials workspace
                <ChevronRight className="h-4 w-4" />
              </Link>
            </FacultyPanel>
          ) : null}
        </>
      )}
    </FacultyPageShell>
  );
}
