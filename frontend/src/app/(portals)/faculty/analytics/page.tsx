'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, PenLine, Search, Users, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { useFacultyCourses, uniqueFacultyCoursesByCourseId } from '@/components/faculty/useFacultyCourses';
import {
  FacultyStudentReport,
  type FacultyStudentReportData,
} from '@/components/faculty/FacultyStudentReport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  isEmptyArray,
  isFacultyDemoEntityId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoCourses,
  getFacultyPortalDemoPack,
  studentsForCourse,
} from '@/lib/mock/faculty-portal-demo';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

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
  assignments_submitted: number;
};

type ScoreFilter = 'all' | 'at-risk' | 'strong';

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

function buildDemoAnalyticsStudents(
  courseId: string,
  query: string,
  courseMeta?: Pick<FacultyCourse, 'course_id' | 'course_code' | 'course_name'>,
): StudentSearchResult[] {
  const demoCourses = facultyDemoCourses();
  const packCourse =
    demoCourses.find((c) => c.course_id === courseId) ?? demoCourses[0];
  if (!packCourse) return [];

  const displayCourseId = courseMeta?.course_id ?? courseId;
  const displayCode = courseMeta?.course_code ?? packCourse.course_code;
  const displayName = courseMeta?.course_name ?? packCourse.course_name;

  // When a live course UUID has an empty roster, reuse the matching/fallback demo roster.
  const rosterSourceId = packCourse.course_id;
  const q = query.trim().toLowerCase();
  return studentsForCourse(rosterSourceId)
    .filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.roll_number.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q),
    )
    .slice(0, 80)
    .map((s) => ({
      student_user_id: s.user_id,
      name: s.name,
      official_email: s.email,
      roll_number: s.roll_number,
      department: s.department,
      course_id: displayCourseId,
      course_code: displayCode,
      course_name: displayName,
      internal_avg_percent: s.internal_marks,
      assignments_submitted: Math.round(s.assignment_score / 10),
    }));
}

function buildDemoStudentReport(
  courseId: string,
  studentUserId: string,
  courseMeta?: Pick<FacultyCourse, 'course_id' | 'course_code' | 'course_name' | 'academic_year'>,
): FacultyStudentReportData | null {
  const pack = getFacultyPortalDemoPack();
  const student = pack.students.find((s) => s.user_id === studentUserId);
  if (!student) return null;

  const demoCourse =
    pack.courses.find((c) => c.course_id === courseId) ??
    pack.courses.find((c) => student.course_ids.includes(c.course_id)) ??
    pack.courses[0];
  if (!demoCourse) return null;

  // Prefer the subject currently selected in the UI (may be a live UUID with demo roster).
  const subject = {
    course_id: courseMeta?.course_id ?? courseId ?? demoCourse.course_id,
    course_code: courseMeta?.course_code ?? demoCourse.course_code,
    course_name: courseMeta?.course_name ?? demoCourse.course_name,
  };
  const academicYear =
    courseMeta?.academic_year ?? demoCourse.academic_year ?? '2025-26';

  const mark =
    pack.marks.find((m) => m.student_id === student.student_id && m.course_id === demoCourse.course_id) ??
    pack.marks.find((m) => m.student_id === student.student_id);
  const courseAssignments = pack.assignments.filter((a) => a.course_id === demoCourse.course_id);
  const submitted = pack.submissions.filter(
    (s) =>
      s.student_id === student.student_id &&
      courseAssignments.some((a) => a.assignment_id === s.assignment_id),
  );
  const internal = mark?.internal ?? student.internal_marks;
  return {
    student: {
      student_user_id: student.user_id,
      name: student.name,
      official_email: student.email,
      roll_number: student.roll_number,
      batch: student.program,
      department: student.department,
    },
    subject,
    summary: {
      internal_avg_percent: internal,
      class_average_percent: 72.5,
      class_rank: Math.max(1, Math.round((100 - internal) / 3)),
      class_size: studentsForCourse(demoCourse.course_id).length || 60,
      cumulative_demerit_points: student.attendance_percent < 60 ? 4 : 0,
      course_demerit_points: student.attendance_percent < 60 ? 2 : 0,
      is_subject_back_triggered: student.overall_grade === 'F',
      assignments_submitted: submitted.length,
      assignments_total: Math.max(courseAssignments.length, 4),
      assignments_graded: submitted.filter((s) => s.status === 'GRADED').length,
      pending_assignments: Math.max(0, courseAssignments.length - submitted.length),
      assignment_completion_percent: student.assignment_score,
      graded_assignment_avg_percent: student.assignment_score,
    },
    academic: {
      academic_year: academicYear,
      semester: student.semester,
      sgpa: Number((student.internal_marks / 20).toFixed(2)),
      cgpa: Number((student.internal_marks / 22).toFixed(2)),
      backlog_count: student.overall_grade === 'F' ? 1 : 0,
      progression_status: student.academic_status,
      remarks: null,
    },
    marks: [
      {
        exam_type: 'INTERNAL',
        marks_obtained: internal,
        max_marks: 40,
        percent: (internal / 40) * 100,
      },
      {
        exam_type: 'ASSIGNMENT',
        marks_obtained: mark?.assignment ?? Math.round(student.assignment_score / 5),
        max_marks: 20,
        percent: student.assignment_score,
      },
      {
        exam_type: 'QUIZ',
        marks_obtained: mark?.quiz ?? 10,
        max_marks: 15,
        percent: ((mark?.quiz ?? 10) / 15) * 100,
      },
      {
        exam_type: 'LAB',
        marks_obtained: mark?.lab ?? Math.round(student.practical_marks / 5),
        max_marks: 20,
        percent: student.practical_marks,
      },
    ],
    assignments: courseAssignments.slice(0, 6).map((a) => {
      const sub = pack.submissions.find(
        (s) => s.assignment_id === a.assignment_id && s.student_id === student.student_id,
      );
      return {
        assignment_id: a.assignment_id,
        title: a.title,
        max_marks: a.max_marks,
        due_date: a.due_date,
        submitted_at: sub?.submitted_on ?? null,
        marks_awarded: sub?.marks ?? null,
        faculty_remarks: sub?.feedback ?? null,
        status:
          sub?.status === 'GRADED'
            ? 'GRADED'
            : sub && sub.status !== 'PENDING'
              ? 'SUBMITTED'
              : 'PENDING',
      };
    }),
    demerits: [],
    risk_flags:
      student.attendance_percent < 75
        ? [
            {
              label: 'Low attendance',
              severity: student.attendance_percent < 55 ? 'HIGH' : 'MEDIUM',
              detail: `Attendance at ${student.attendance_percent}% (minimum 75%).`,
            },
          ]
        : [],
    gpa_history: [
      {
        semester: student.semester - 1,
        sgpa: 7.2,
        cgpa: 7.4,
        status: 'PASS',
        academic_year: academicYear,
        source: 'demo',
      },
      {
        semester: student.semester,
        sgpa: Number((student.internal_marks / 20).toFixed(2)),
        cgpa: Number((student.internal_marks / 22).toFixed(2)),
        status: 'PASS',
        academic_year: academicYear,
        source: 'demo',
      },
    ],
  };
}

export default function FacultyAnalyticsPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [students, setStudents] = useState<StudentSearchResult[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [report, setReport] = useState<FacultyStudentReportData | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const effectiveCourseId = courseId || courseOptions[0]?.course_id || '';
  const selectedCourse = courseOptions.find((course) => course.course_id === effectiveCourseId);
  const courseMeta = selectedCourse
    ? {
        course_id: selectedCourse.course_id,
        course_code: selectedCourse.course_code,
        course_name: selectedCourse.course_name,
        academic_year: selectedCourse.academic_year,
      }
    : undefined;

  useEffect(() => {
    if (!effectiveCourseId) return;

    let active = true;
    const params = new URLSearchParams({ courseId: effectiveCourseId });
    if (query.trim()) params.set('q', query.trim());

    async function loadStudents() {
      setLoadingStudents(true);
      try {
        // Demo course IDs are not in Postgres — use local roster only.
        if (isFacultyDemoEntityId(effectiveCourseId)) {
          if (!active) return;
          const demoRows = buildDemoAnalyticsStudents(effectiveCourseId, query, courseMeta);
          setStudents(demoRows);
          setSelectedStudentId((current) => {
            if (current && demoRows.some((student) => student.student_user_id === current)) return current;
            return '';
          });
          return;
        }

        const rows = await api.get<StudentSearchResult[]>(
          `/api/academics/faculty/workspaces/analytics/students?${params.toString()}`,
        );
        if (!active) return;
        const demoRows = buildDemoAnalyticsStudents(effectiveCourseId, query, courseMeta);
        const resolved = withFacultyDemoFallback(rows, demoRows, isEmptyArray);
        setStudents(resolved);
        setSelectedStudentId((current) => {
          if (current && resolved.some((student) => student.student_user_id === current)) return current;
          return '';
        });
      } catch (error) {
        if (!active) return;
        const demoRows = buildDemoAnalyticsStudents(effectiveCourseId, query, courseMeta);
        const resolved = withFacultyDemoFallback([], demoRows, isEmptyArray);
        setStudents(resolved);
        setSelectedStudentId((current) => {
          if (current && resolved.some((student) => student.student_user_id === current)) return current;
          return '';
        });
        if (resolved.length === 0) {
          toast.error(error instanceof Error ? error.message : 'Failed to search students');
        }
      } finally {
        if (active) setLoadingStudents(false);
      }
    }

    void loadStudents();
    return () => {
      active = false;
    };
  }, [api, effectiveCourseId, query, courseMeta?.course_code, courseMeta?.course_name]);

  useEffect(() => {
    if (!effectiveCourseId || !selectedStudentId) {
      setReport(null);
      return;
    }

    let active = true;
    const params = new URLSearchParams({ courseId: effectiveCourseId });

    async function loadReport() {
      setLoadingReport(true);
      try {
        // Demo smoke student/course IDs never exist in Postgres — skip the API (avoids 500).
        if (
          isFacultyDemoEntityId(selectedStudentId) ||
          isFacultyDemoEntityId(effectiveCourseId)
        ) {
          const demo = buildDemoStudentReport(effectiveCourseId, selectedStudentId, courseMeta);
          if (!active) return;
          setReport(demo);
          if (!demo) {
            toast.error('Could not build demo analysis for this student');
          }
          return;
        }

        const data = await api.get<FacultyStudentReportData>(
          `/api/academics/faculty/workspaces/analytics/students/${encodeURIComponent(selectedStudentId)}/report?${params.toString()}`,
        );
        if (!active) return;
        setReport(
          withFacultyDemoFallback(
            data,
            buildDemoStudentReport(effectiveCourseId, selectedStudentId, courseMeta),
          ),
        );
      } catch (error) {
        if (!active) return;
        const demo = withFacultyDemoFallback(
          null,
          buildDemoStudentReport(effectiveCourseId, selectedStudentId, courseMeta),
        );
        setReport(demo);
        if (!demo) {
          toast.error(error instanceof Error ? error.message : 'Failed to load student analysis');
        }
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
    courseMeta?.course_code,
    courseMeta?.course_name,
    courseMeta?.academic_year,
  ]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const score = Number(student.internal_avg_percent ?? 0);
      if (scoreFilter === 'at-risk') return score < 40;
      if (scoreFilter === 'strong') return score >= 75;
      return true;
    });
  }, [students, scoreFilter]);

  const selectedStudent =
    filteredStudents.find((s) => s.student_user_id === selectedStudentId) ??
    students.find((s) => s.student_user_id === selectedStudentId) ??
    null;

  const atRiskCount = students.filter((s) => Number(s.internal_avg_percent) < 40).length;
  const strongCount = students.filter((s) => Number(s.internal_avg_percent) >= 75).length;

  function selectStudent(studentId: string) {
    setSelectedStudentId(studentId);
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
    setSelectedStudentId(next.student_user_id);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-student-id="${next.student_user_id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Student Analytics"
        description="Pick a subject, select a student, and review graphical and numerical performance signals."
        meta={
          <>
            <FacultyMetricChip label="Subject" value={selectedCourse?.course_code ?? 'Select'} emphasis />
            <FacultyMetricChip label="Roster" value={students.length} />
            <FacultyMetricChip label="At risk (<40%)" value={atRiskCount} />
            <FacultyMetricChip
              label="Selected"
              value={selectedStudent ? scoreLabel(selectedStudent.internal_avg_percent) : '—'}
            />
          </>
        }
      />

      <div className="w-full space-y-6">
        <FacultyPanel
          title="Find Student"
          description="Choose a subject, filter the roster, then select a student for analysis."
          className="w-full"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-end">
            <label className="text-sm">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Subject</span>
              <Select
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                value={effectiveCourseId}
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
              <span className="mb-1.5 block font-medium text-sgvu-navy">Search roster</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-9"
                  placeholder="Roll no, ID, email, or name"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={!effectiveCourseId}
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

        <div className="grid w-full gap-6 xl:grid-cols-2 xl:items-start">
          <FacultyPanel
            title="Subject Students"
            description={
              selectedCourse
                ? `${selectedCourse.course_code} · click a student to load analysis`
                : 'Select a subject to load the roster'
            }
            count={filteredStudents.length}
            className="w-full"
            contentClassName="p-0 sm:p-0"
          >
            {loadingStudents ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-4 sm:p-5">
                <FacultyEmptyState
                  title={!effectiveCourseId ? 'No subject selected' : 'No students found'}
                  description={
                    effectiveCourseId
                      ? 'Try another search or filter for this subject.'
                      : 'Choose a subject above to browse enrolled students.'
                  }
                  className="py-8"
                />
              </div>
            ) : (
              <div
                ref={listRef}
                className="max-h-[min(70vh,40rem)] space-y-2 overflow-y-auto p-4 sm:p-5"
                role="listbox"
                aria-label="Subject students"
              >
                {filteredStudents.map((student) => {
                  const selected = selectedStudentId === student.student_user_id;
                  return (
                    <button
                      key={resultKey(student)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-student-id={student.student_user_id}
                      onClick={() => selectStudent(student.student_user_id)}
                      className={cn(
                        'box-border grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left text-sm transition',
                        'hover:border-sgvu-gold/70 hover:bg-sgvu-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/30',
                        selected
                          ? 'border-sgvu-gold bg-sgvu-gold/10 shadow-sm'
                          : 'border-border/60 bg-background',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sgvu-navy">{student.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{student.roll_number}</p>
                        <p className="truncate text-xs text-muted-foreground">{student.official_email}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={scoreTone(student.internal_avg_percent)} className="text-[10px]">
                          {scoreLabel(student.internal_avg_percent)}
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
                    ? `${selectedStudent.name} · ${selectedCourse?.course_code ?? 'Subject'}`
                    : 'Loading report'
                }
                className="w-full"
              >
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
                  <p className="text-sm text-muted-foreground">Preparing student analysis…</p>
                </div>
              </FacultyPanel>
            ) : report ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">Student Analysis</p>
                    <p className="truncate text-sm font-semibold text-sgvu-navy">{report.student.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {report.student.roll_number} · {report.subject.course_code}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/faculty/grade-change">
                        <PenLine className="mr-1.5 h-3.5 w-3.5" />
                        Grade change
                      </Link>
                    </Button>
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
                  </div>
                </div>
                <FacultyStudentReport report={report} />
              </>
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

        {!effectiveCourseId ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            Assign teaching courses to unlock student analytics for your subjects.
          </div>
        ) : null}
      </div>
    </FacultyPageShell>
  );
}
