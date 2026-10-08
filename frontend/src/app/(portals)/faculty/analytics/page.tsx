'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, PenLine, Search, Users, X } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyErrorBanner,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { useFacultyCourses, uniqueFacultyCoursesByCourseId } from '@/components/faculty/useFacultyCourses';
import { FacultyStudentReport, type FacultyStudentReportData } from '@/components/faculty/FacultyStudentReport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type StudentSearchResult = {
  student_user_id: string;
  name: string;
  official_email: string;
  roll_number: string;
  department: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  internal_avg_percent: string | number;
  attendance_percent: string | number | null;
  assignments_submitted: number;
};

type ScoreFilter = 'all' | 'at-risk' | 'strong';
type SearchScope = 'subject' | 'department';

function resultKey(student: StudentSearchResult) {
  return `${student.course_id}:${student.student_user_id}`;
}

function scoreLabel(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? Math.round(n) : 0}%`;
}

function scoreTone(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (n < 40) return 'destructive' as const;
  if (n < 60) return 'secondary' as const;
  return 'outline' as const;
}

export default function FacultyAnalyticsPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('subject');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [students, setStudents] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [report, setReport] = useState<FacultyStudentReportData | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const effectiveCourseId = courseId || courseOptions[0]?.course_id || '';
  const selectedCourse = courseOptions.find((course) => course.course_id === effectiveCourseId);
  useEffect(() => {
    if (searchScope === 'subject' && !effectiveCourseId) return;
    if (searchScope === 'department' && query.trim().length < 2) {
      return;
    }

    let active = true;
    const params = new URLSearchParams({ courseId: effectiveCourseId });
    if (query.trim()) params.set('q', query.trim());

    async function loadStudents() {
      setLoadingStudents(true);
      setStudentsError(null);
      try {
        const endpoint =
          searchScope === 'department'
            ? `/api/academics/faculty/workspaces/student-directory?q=${encodeURIComponent(query.trim())}`
            : `/api/academics/faculty/workspaces/analytics/students?${params.toString()}`;
        const rows = await api.get<StudentSearchResult[]>(endpoint);
        if (!active) return;
        if (!Array.isArray(rows)) throw new Error('Student roster API returned an invalid response');
        setStudents(rows);
        setSelectedStudentId((current) => {
          if (current && rows.some((student) => student.student_user_id === current)) return current;
          return '';
        });
      } catch (error) {
        if (!active) return;
        setStudents([]);
        setSelectedStudentId('');
        setStudentsError(error instanceof Error ? error.message : 'Failed to search students');
      } finally {
        if (active) setLoadingStudents(false);
      }
    }

    void loadStudents();
    return () => {
      active = false;
    };
  }, [
    api,
    effectiveCourseId,
    query,
    searchScope,
  ]);

  useEffect(() => {
    if (!effectiveCourseId || !selectedStudentId) {
      return;
    }

    let active = true;
    const params = new URLSearchParams({ courseId: effectiveCourseId });

    async function loadReport() {
      setLoadingReport(true);
      setReportError(null);
      try {
        const endpoint =
          searchScope === 'department'
            ? `/api/academics/faculty/workspaces/student-directory/${encodeURIComponent(selectedStudentId)}/report?${params.toString()}`
            : `/api/academics/faculty/workspaces/analytics/students/${encodeURIComponent(selectedStudentId)}/report?${params.toString()}`;
        const data = await api.get<FacultyStudentReportData>(endpoint);
        if (!active) return;
        if (!data?.student || !data.subject) throw new Error('Student report API returned an invalid response');
        setReport(data);
      } catch (error) {
        if (!active) return;
        setReport(null);
        setReportError(error instanceof Error ? error.message : 'Failed to load student analysis');
      } finally {
        if (active) setLoadingReport(false);
      }
    }

    void loadReport();
    return () => {
      active = false;
    };
  }, [
    api,
    effectiveCourseId,
    selectedStudentId,
    searchScope,
  ]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const score = Number(student.internal_avg_percent ?? 0);
      const attendance =
        student.attendance_percent == null
          ? null
          : Number(student.attendance_percent);
      if (scoreFilter === 'at-risk')
        return score < 40 || (attendance !== null && attendance < 75);
      if (scoreFilter === 'strong')
        return score >= 75 && (attendance === null || attendance >= 85);
      return true;
    });
  }, [students, scoreFilter]);

  const selectedStudent =
    filteredStudents.find((s) => s.student_user_id === selectedStudentId && s.course_id === effectiveCourseId) ??
    students.find((s) => s.student_user_id === selectedStudentId && s.course_id === effectiveCourseId) ??
    null;

  const atRiskCount = students.filter((student) => {
    const attendance =
      student.attendance_percent == null
        ? null
        : Number(student.attendance_percent);
    return (
      Number(student.internal_avg_percent) < 40 ||
      (attendance !== null && attendance < 75)
    );
  }).length;
  const strongCount = students.filter((student) => {
    const attendance =
      student.attendance_percent == null
        ? null
        : Number(student.attendance_percent);
    return (
      Number(student.internal_avg_percent) >= 75 &&
      (attendance === null || attendance >= 85)
    );
  }).length;

  function selectStudent(student: StudentSearchResult) {
    setSelectedStudentId(student.student_user_id);
    if (searchScope === 'department') setCourseId(student.course_id);
  }

  function moveSelection(delta: number) {
    if (filteredStudents.length === 0) return;
    const idx = filteredStudents.findIndex((s) => s.student_user_id === selectedStudentId);
    const nextIdx =
      idx < 0
        ? delta > 0
          ? 0
          : filteredStudents.length - 1
        : Math.max(0, Math.min(filteredStudents.length - 1, idx + delta));
    const next = filteredStudents[nextIdx];
    if (!next) return;
    selectStudent(next);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-student-id="${next.student_user_id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Student Performance"
        description="Review your subject rosters or find a student in your department by name or registration number."
        meta={
          <>
            <FacultyMetricChip label="Subject" value={selectedCourse?.course_code ?? 'Select'} emphasis />
            <FacultyMetricChip label="Roster" value={students.length} />
            <FacultyMetricChip label="At risk" value={atRiskCount} />
            <FacultyMetricChip
              label="Selected"
              value={selectedStudent ? scoreLabel(selectedStudent.internal_avg_percent) : '—'}
            />
          </>
        }
      />

      <div className="w-full space-y-5">
        <FacultyPanel
          title="Find Student"
          description="Use My subject roster for teaching work, or Department lookup for an authorized academic record search."
          className="w-full"
        >
          <div className="mb-4 inline-flex rounded-lg border border-border/60 bg-muted/30 p-1">
            {(
              [
                { id: 'subject', label: 'My subject roster' },
                { id: 'department', label: 'Department student lookup' },
              ] as const
            ).map((scope) => (
              <button
                key={scope.id}
                type="button"
                onClick={() => {
                  setSearchScope(scope.id);
                  setQuery('');
                  setStudents([]);
                  setSelectedStudentId('');
                  setReport(null);
                }}
                className={cn(
                  'rounded-md px-3 py-2 text-xs font-semibold transition',
                  searchScope === scope.id
                    ? 'bg-white text-sgvu-navy shadow-sm'
                    : 'text-muted-foreground hover:text-sgvu-navy',
                )}
              >
                {scope.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1.05fr)_minmax(18rem,1fr)_auto] lg:items-end">
            <label className={cn('text-sm', searchScope === 'department' && 'opacity-60')}>
              <span className="mb-1.5 block font-medium text-sgvu-navy">Subject</span>
              <Select
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                value={effectiveCourseId}
                disabled={searchScope === 'department'}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setSelectedStudentId('');
                  setReport(null);
                  setScoreFilter('all');
                }}
              >
                {courseOptions.length === 0 ? <option value="">No subjects assigned</option> : null}
                {courseOptions.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_code} · {course.course_name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-sgvu-navy">
                {searchScope === 'department' ? 'Student name or registration number' : 'Search roster'}
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9"
                  placeholder={
                    searchScope === 'department' ? 'Enter at least 2 characters' : 'Roll no, ID, email, or name'
                  }
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery(value);
                    if (searchScope === 'department' && value.trim().length < 2) {
                      setStudents([]);
                      setSelectedStudentId('');
                      setReport(null);
                    }
                  }}
                  disabled={searchScope === 'subject' && !effectiveCourseId}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      moveSelection(1);
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveSelection(-1);
                    }
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-sgvu-navy"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </label>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              {(
                [
                  { id: 'all', label: `All (${students.length})` },
                  { id: 'at-risk', label: `At risk (${atRiskCount})` },
                  { id: 'strong', label: `Strong (${strongCount})` },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setScoreFilter(chip.id)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    scoreFilter === chip.id
                      ? 'border-sgvu-navy bg-sgvu-navy text-white'
                      : 'border-border/60 bg-background text-sgvu-navy hover:border-sgvu-gold/60 hover:bg-sgvu-gold/5',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </FacultyPanel>

        <div className="grid w-full gap-5 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start 2xl:grid-cols-[24rem_minmax(0,1fr)]">
          <FacultyPanel
            title={searchScope === 'department' ? 'Department Search Results' : 'Subject Students'}
            description={
              searchScope === 'department'
                ? 'Results are limited to students in your assigned department'
                : selectedCourse
                  ? `${selectedCourse.course_code} · click a student to load analysis`
                  : 'Select a subject to load the roster'
            }
            count={filteredStudents.length}
            className="w-full xl:sticky xl:top-4"
            contentClassName="p-0 sm:p-0"
          >
            {loadingStudents ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : studentsError ? (
              <div className="p-4 sm:p-5"><FacultyErrorBanner message={studentsError} /></div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-4 sm:p-5">
                <FacultyEmptyState
                  title={
                    searchScope === 'department' && query.trim().length < 2
                      ? 'Search for a student'
                      : !effectiveCourseId
                        ? 'No subject selected'
                        : 'No students found'
                  }
                  description={
                    searchScope === 'department' && query.trim().length < 2
                      ? 'Enter a student name or registration number above.'
                      : effectiveCourseId
                        ? 'Try another search or filter for this subject.'
                        : 'Choose a subject above to browse enrolled students.'
                  }
                  className="py-8"
                />
              </div>
            ) : (
              <div
                ref={listRef}
                className="max-h-[min(72vh,46rem)] space-y-2 overflow-y-auto p-3 sm:p-4"
                role="listbox"
                aria-label="Subject students"
              >
                {filteredStudents.map((student) => {
                  const selected =
                    selectedStudentId === student.student_user_id && effectiveCourseId === student.course_id;
                  return (
                    <button
                      key={resultKey(student)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-student-id={student.student_user_id}
                      onClick={() => selectStudent(student)}
                      className={cn(
                        'box-border grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left text-sm transition',
                        'hover:border-sgvu-gold/70 hover:bg-sgvu-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/30',
                        selected ? 'border-sgvu-gold bg-sgvu-gold/10 shadow-sm' : 'border-border/60 bg-background',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sgvu-navy">{student.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{student.roll_number}</p>
                        <p className="truncate text-xs text-muted-foreground">{student.official_email}</p>
                        {searchScope === 'department' ? (
                          <p className="mt-1 truncate text-xs font-medium text-sgvu-navy">
                            {student.course_code} · {student.course_name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={scoreTone(student.internal_avg_percent)} className="text-[10px]">
                          Marks {scoreLabel(student.internal_avg_percent)}
                        </Badge>
                        <Badge
                          variant={
                            student.attendance_percent != null &&
                            Number(student.attendance_percent) < 75
                              ? 'destructive'
                              : 'outline'
                          }
                          className="text-[10px]"
                        >
                          Attendance{' '}
                          {student.attendance_percent == null
                            ? 'N/A'
                            : scoreLabel(student.attendance_percent)}
                        </Badge>
                        {selected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sgvu-navy">
                            Viewing <ArrowRight className="h-3 w-3" />
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </FacultyPanel>

          <div className="min-w-0 w-full space-y-4">
            {!selectedStudentId ? (
              <FacultyPanel
                title="Student Analysis"
                description="Select a student from the roster to view charts and metrics"
                className="w-full"
              >
                <FacultyEmptyState
                  title="No student selected"
                  description="Choose a student on the left to open graphical and numerical analysis for this subject."
                  className="py-14"
                />
              </FacultyPanel>
            ) : loadingReport ? (
              <FacultyPanel
                title="Student Analysis"
                description={
                  selectedStudent
                    ? `${selectedStudent.name} · ${selectedStudent.course_code ?? selectedCourse?.course_code ?? 'Subject'}`
                    : 'Loading report'
                }
                className="w-full"
              >
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
                  <p className="text-sm text-muted-foreground">Preparing student analysis…</p>
                </div>
              </FacultyPanel>
            ) : reportError ? (
              <FacultyPanel title="Student Analysis" className="w-full">
                <FacultyErrorBanner message={reportError} />
              </FacultyPanel>
            ) : report ? (
                <FacultyStudentReport
                  report={report}
                  actions={
                    <>
                    {searchScope === 'subject' ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href="/faculty/grade-change">
                          <PenLine className="mr-1.5 h-3.5 w-3.5" />
                          Grade change
                        </Link>
                      </Button>
                    ) : (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                        Read-only department report
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedStudentId('');
                        setReport(null);
                      }}
                    >
                      Clear
                    </Button>
                    </>
                  }
                />
            ) : (
              <FacultyPanel title="Student Analysis" className="w-full">
                <FacultyEmptyState
                  title="Analysis unavailable"
                  description="Could not load this student’s report. Try another student or refresh."
                  className="py-12"
                />
              </FacultyPanel>
            )}
          </div>
        </div>

        {searchScope === 'subject' && !effectiveCourseId ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            Assign teaching courses to unlock student analytics for your subjects.
          </div>
        ) : null}
      </div>
    </FacultyPageShell>
  );
}
