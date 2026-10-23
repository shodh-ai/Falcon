'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LineChart,
  Loader2,
  Printer,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
  FacultyMetricChip,
  FacultyEmptyState,
  FacultyErrorBanner,
} from '@/components/faculty';
import {
  useFacultyCourses,
  uniqueFacultyCoursesByCourseId,
} from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { FacultyAccountScope } from '@/components/faculty/FacultyAccountScope';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoAssignments,
  facultyDemoCourses,
  facultyDemoReportStudents,
  studentsForCourse,
} from '@/lib/mock/faculty-portal-demo';

type ReportKind = 'full' | 'attendance' | 'assignments' | 'atrisk';

type ReportStudent = {
  name?: string;
  roll_number?: string;
  attendance_percent?: number | string | null;
  attendance_record_count?: number | string;
};

type ReportAssignment = {
  title?: string;
  due_date?: string;
  max_marks?: number;
  submission_count?: number;
};

type CourseReport = {
  generatedAt: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  kind: ReportKind;
  students: ReportStudent[];
  assignments: ReportAssignment[];
  avgAttendance: number | null;
  attendanceUnrecorded: number;
  below75: number;
  assignmentCount: number;
  submissionTotal: number;
};

const REPORT_KINDS: Array<{
  id: ReportKind;
  label: string;
  hint: string;
  icon: typeof FileSpreadsheet;
}> = [
  {
    id: 'full',
    label: 'Full course report',
    hint: 'Attendance + assignments + risk snapshot',
    icon: Sparkles,
  },
  {
    id: 'attendance',
    label: 'Attendance only',
    hint: 'Roll-wise attendance % export',
    icon: Users,
  },
  {
    id: 'assignments',
    label: 'Assignments only',
    hint: 'Due dates and submission counts',
    icon: ClipboardList,
  },
  {
    id: 'atrisk',
    label: 'At-risk students',
    hint: 'Students below 75% attendance',
    icon: AlertTriangle,
  },
];

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
          return value;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pct(value: number | string | null | undefined) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function attendancePct(student: ReportStudent) {
  if (student.attendance_record_count != null) {
    const count = Number(student.attendance_record_count);
    if (!Number.isFinite(count) || count <= 0) return null;
  }
  return pct(student.attendance_percent);
}

function attendanceText(student: ReportStudent) {
  const value = attendancePct(student);
  if (value !== null) return `${value.toFixed(1)}%`;
  return student.attendance_record_count != null && Number(student.attendance_record_count) === 0
    ? 'Not recorded'
    : 'Not available';
}

function isAtRisk(student: ReportStudent) {
  const value = attendancePct(student);
  return value !== null && value < 75;
}

function demoStudentsForCourse(courseId: string): ReportStudent[] {
  const direct = facultyDemoReportStudents(courseId);
  if (direct.length > 0) return direct;
  const fallbackCourse = facultyDemoCourses()[0];
  if (!fallbackCourse) return [];
  return studentsForCourse(fallbackCourse.course_id).map((s) => ({
    name: s.name,
    roll_number: s.roll_number,
    attendance_percent: s.attendance_percent,
  }));
}

function demoAssignmentsForCourse(courseId: string): ReportAssignment[] {
  const direct = facultyDemoAssignments(courseId);
  if (direct.length > 0) return direct;
  const fallbackCourse = facultyDemoCourses()[0];
  return fallbackCourse ? facultyDemoAssignments(fallbackCourse.course_id) : [];
}

export default function FacultyReportsPage() {
  const api = useAuthedApi();
  return <FacultyAccountScope scope={api}><FacultyReportsContent api={api} /></FacultyAccountScope>;
}

function FacultyReportsContent({ api }: { api: ReturnType<typeof useAuthedApi> }) {
  const { courses, loading, error: coursesError } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const [courseId, setCourseId] = useState('');
  const [kind, setKind] = useState<ReportKind>('full');
  const [busy, setBusy] = useState(false);
  const [generatedReport, setReport] = useState<CourseReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const generationId = useRef(0);

  const courseLoadError = coursesError && coursesError !== 'No courses allocated to your timetable yet.'
    ? coursesError
    : null;
  const coursesUnavailable = loading || Boolean(courseLoadError) || courseOptions.length === 0;

  const selectedCourse = useMemo(
    () => courseId
      ? courseOptions.find((c) => c.course_id === courseId) ?? null
      : courseOptions[0] ?? null,
    [courseOptions, courseId],
  );

  const effectiveCourseId = coursesUnavailable ? '' : selectedCourse?.course_id ?? '';
  const report = !busy && generatedReport?.courseId === effectiveCourseId && generatedReport.kind === kind
    ? generatedReport
    : null;

  useEffect(() => {
    generationId.current += 1;
    // A changed report scope must immediately invalidate its old snapshot and spinner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(null);
    setReportError(null);
    setBusy(false);
    return () => { generationId.current += 1; };
  }, [effectiveCourseId, kind, loading, courseLoadError]);

  async function generateReport() {
    if (busy || coursesUnavailable) return;
    const targetCourseId = effectiveCourseId;
    if (!targetCourseId) {
      toast.error('Select a course first');
      return;
    }

    const course =
      courseOptions.find((c) => c.course_id === targetCourseId) ?? null;

    if (!course) {
      toast.error('Course not found');
      return;
    }

    if (!courseId) setCourseId(targetCourseId);

    setBusy(true);
    setReport(null);
    setReportError(null);
    const requestId = ++generationId.current;
    try {
      let students: ReportStudent[] = [];
      let assignments: ReportAssignment[] = [];

      if (!isFacultyDemoSmokeId(targetCourseId)) {
        [students, assignments] = await Promise.all([
          api.get<ReportStudent[]>(`/api/academics/faculty/course/${targetCourseId}/students`),
          api.get<ReportAssignment[]>(`/api/academics/faculty/assignments?courseId=${targetCourseId}`),
        ]);
      }
      if (requestId !== generationId.current) return;

      students = withFacultyDemoFallback(
        students,
        demoStudentsForCourse(targetCourseId),
        isEmptyArray,
      );
      assignments = withFacultyDemoFallback(
        assignments,
        demoAssignmentsForCourse(targetCourseId),
        isEmptyArray,
      );

      const measuredAttendance = students
        .map(attendancePct)
        .filter((value): value is number => value !== null);
      const avgAttendance = measuredAttendance.length
        ? measuredAttendance.reduce((sum, value) => sum + value, 0) / measuredAttendance.length
        : null;
      const below75 = students.filter(isAtRisk).length;
      const submissionTotal = assignments.reduce(
        (sum, a) => sum + Number(a.submission_count ?? 0),
        0,
      );

      const built: CourseReport = {
        generatedAt: new Date().toISOString(),
        courseId: targetCourseId,
        courseCode: course.course_code,
        courseName: course.course_name,
        kind,
        students,
        assignments,
        avgAttendance: avgAttendance === null ? null : Math.round(avgAttendance * 10) / 10,
        attendanceUnrecorded: students.length - measuredAttendance.length,
        below75,
        assignmentCount: assignments.length,
        submissionTotal,
      };

      setReport(built);
      toast.success(`${course.course_code} report ready`);
    } catch (e) {
      if (requestId !== generationId.current) return;
      const message = e instanceof Error ? e.message : 'Could not generate report';
      setReportError(message);
      toast.error(message);
    } finally {
      if (requestId === generationId.current) setBusy(false);
    }
  }

  function downloadReportCsv() {
    if (!report) return;

    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    const base = `${report.courseCode}-${report.kind}-${stamp}`.replace(/\s+/g, '_');

    if (report.kind === 'assignments') {
      downloadCsv(`${base}.csv`, [
        ['Title', 'Due date', 'Max marks', 'Submissions'],
        ...report.assignments.map((r) => [
          r.title ?? '',
          r.due_date ? new Date(r.due_date).toLocaleString('en-IN') : '',
          String(r.max_marks ?? ''),
          String(r.submission_count ?? 0),
        ]),
      ]);
    } else if (report.kind === 'atrisk') {
      const rows = report.students.filter(isAtRisk);
      downloadCsv(`${base}.csv`, [
        ['Name', 'Roll', 'Attendance %', 'Risk'],
        ...rows.map((s) => [
          s.name ?? '',
          s.roll_number ?? '',
          String(attendancePct(s) ?? ''),
          (attendancePct(s) ?? 100) < 60 ? 'HIGH' : 'MEDIUM',
        ]),
      ]);
    } else if (report.kind === 'attendance') {
      downloadCsv(`${base}.csv`, [
        ['Name', 'Roll', 'Attendance %'],
        ...report.students.map((s) => [
          s.name ?? '',
          s.roll_number ?? '',
          String(attendancePct(s) ?? ''),
        ]),
      ]);
    } else {
      // Full report: summary + both tables in one file
      downloadCsv(`${base}.csv`, [
        ['Course report'],
        ['Course', `${report.courseCode} — ${report.courseName}`],
        ['Generated', new Date(report.generatedAt).toLocaleString('en-IN')],
        ['Students', String(report.students.length)],
        ['Avg attendance %', report.avgAttendance === null ? '' : String(report.avgAttendance)],
        ['Students without attendance data', String(report.attendanceUnrecorded)],
        ['Below 75%', String(report.below75)],
        ['Assignments', String(report.assignmentCount)],
        [],
        ['--- Attendance roster ---'],
        ['Name', 'Roll', 'Attendance %'],
        ...report.students.map((s) => [
          s.name ?? '',
          s.roll_number ?? '',
          String(attendancePct(s) ?? ''),
        ]),
        [],
        ['--- Assignments ---'],
        ['Title', 'Due date', 'Max marks', 'Submissions'],
        ...report.assignments.map((r) => [
          r.title ?? '',
          r.due_date ? new Date(r.due_date).toLocaleString('en-IN') : '',
          String(r.max_marks ?? ''),
          String(r.submission_count ?? 0),
        ]),
      ]);
    }

    toast.success('CSV downloaded');
  }

  function printReport() {
    if (!report) return;
    window.print();
  }

  const previewStudents = useMemo(() => {
    if (!report) return [];
    if (report.kind === 'atrisk') {
      return report.students
        .filter(isAtRisk)
        .sort((a, b) => (attendancePct(a) ?? 101) - (attendancePct(b) ?? 101));
    }
    return [...report.students].sort(
      (a, b) => (attendancePct(a) ?? 101) - (attendancePct(b) ?? 101),
    );
  }, [report]);

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Reports"
        description="Generate course-wise teaching reports — preview first, then download or print."
        meta={
          !coursesUnavailable ? (
            <FacultyMetricChip
              label="Courses"
              value={courseOptions.length}
              emphasis
            />
          ) : null
        }
      />

      {/* Builder */}
      <FacultyPanel
        title="Generate course report"
        description="Pick a subject and report type, then generate a live preview"
      >
        <div className="space-y-5">
          <label htmlFor="reports-course" className="block text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
            <Select
              id="reports-course"
              className="h-11 w-full rounded-lg border border-border/60 bg-background px-3 text-sm"
              value={effectiveCourseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setReport(null);
              }}
              disabled={coursesUnavailable || busy}
            >
              <option value="">
                {loading ? 'Loading courses…' : courseLoadError ? 'Unable to load courses' : courseOptions.length === 0 ? 'No courses assigned' : 'Select course'}
              </option>
              {courseOptions.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </Select>
          </label>
          {!loading && courseLoadError ? (
            <div role="alert">
              <FacultyErrorBanner message={`${courseLoadError} Refresh the page to try again.`} />
            </div>
          ) : !loading && courseOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              No teaching courses are assigned yet. Contact your HOD if you expected a teaching assignment.
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-sgvu-navy">Report type</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {REPORT_KINDS.map((item) => {
                const Icon = item.icon;
                const active = kind === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy || !effectiveCourseId}
                    onClick={() => {
                      setKind(item.id);
                      setReport(null);
                    }}
                    className={cn(
                      'flex h-full flex-col rounded-xl border p-3 text-left transition',
                      active
                        ? 'border-sgvu-gold bg-sgvu-gold/10 ring-1 ring-sgvu-gold/50'
                        : 'border-border/60 bg-background hover:border-sgvu-navy/25 hover:bg-muted/30',
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          active ? 'text-sgvu-navy' : 'text-muted-foreground',
                        )}
                      />
                      <span className="text-sm font-semibold text-sgvu-navy">{item.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
            <Button
              type="button"
              className="h-11 min-w-[11rem]"
              disabled={busy || !effectiveCourseId}
              onClick={() => void generateReport()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {busy ? 'Generating…' : 'Generate report'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!report || busy}
              onClick={downloadReportCsv}
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!report || busy}
              onClick={printReport}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print preview
            </Button>
          </div>
        </div>
      </FacultyPanel>

      {/* Preview */}
      {!report && !busy ? (
        <FacultyPanel title="Report preview" description="Your generated report will appear here">
          {reportError ? (
            <div role="alert"><FacultyErrorBanner message={reportError} /></div>
          ) : (
            <FacultyEmptyState
              title={loading ? 'Loading courses…' : 'No report yet'}
              description="Select a course and report type, then click Generate report."
            />
          )}
        </FacultyPanel>
      ) : null}

      {busy ? (
        <FacultyPanel title="Report preview" description="Building course snapshot…">
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-sgvu-navy" />
            Gathering attendance, roster, and assignment data…
          </div>
        </FacultyPanel>
      ) : null}

      {report && !busy ? (
        <div className="space-y-4 print:space-y-3" id="faculty-course-report-preview">
          <FacultyPanel
            title={`${report.courseCode} · ${REPORT_KINDS.find((k) => k.id === report.kind)?.label}`}
            description={`${report.courseName} · Generated ${new Date(report.generatedAt).toLocaleString('en-IN')}`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-sgvu-navy/10 text-sgvu-navy">
                {report.students.length} students
              </Badge>
              <Badge variant="outline">{report.assignmentCount} assignments</Badge>
              {report.below75 > 0 ? (
                <Badge variant="destructive">{report.below75} below 75%</Badge>
              ) : report.attendanceUnrecorded === 0 && report.students.length > 0 ? (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Attendance healthy
                </Badge>
              ) : null}
              {report.attendanceUnrecorded > 0 ? (
                <Badge variant="outline">{report.attendanceUnrecorded} without attendance data</Badge>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Roster size</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-sgvu-navy">
                  {report.students.length}
                </p>
              </div>
              <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/5 p-4">
                <p className="text-xs text-muted-foreground">Avg attendance</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-sgvu-navy">
                  {report.avgAttendance === null ? 'N/A' : `${report.avgAttendance}%`}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">At risk (&lt;75%)</p>
                <p
                  className={cn(
                    'mt-1 text-2xl font-black tabular-nums',
                    report.below75 > 0 ? 'text-red-700' : 'text-sgvu-navy',
                  )}
                >
                  {report.below75}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Assignment submissions</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-sgvu-navy">
                  {report.submissionTotal}
                </p>
              </div>
            </div>
          </FacultyPanel>

          {report.attendanceUnrecorded > 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              Students without recorded attendance are excluded from the attendance average and at-risk count.
            </p>
          ) : null}

          {(report.kind === 'full' ||
            report.kind === 'attendance' ||
            report.kind === 'atrisk') && (
            <FacultyPanel
              title={report.kind === 'atrisk' ? 'At-risk roster' : 'Attendance roster'}
              count={previewStudents.length}
              description={
                report.kind === 'atrisk'
                  ? 'Students under 75% attendance, lowest first'
                  : 'Sorted by attendance ascending'
              }
            >
              {previewStudents.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  No students match this report filter.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Roll</th>
                        <th className="px-3 py-2 text-right font-medium">Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewStudents.slice(0, 40).map((s, i) => {
                        const value = attendancePct(s);
                        return (
                          <tr key={`${s.roll_number}-${i}`} className="border-b last:border-0">
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="px-3 py-2 font-medium text-sgvu-navy">{s.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{s.roll_number}</td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right font-bold tabular-nums',
                                value === null
                                  ? 'text-muted-foreground'
                                  : value < 60
                                  ? 'text-red-700'
                                  : value < 75
                                    ? 'text-amber-700'
                                    : 'text-emerald-700',
                              )}
                            >
                              {attendanceText(s)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {previewStudents.length > 40 ? (
                    <p className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Showing first 40 of {previewStudents.length}. Download CSV for the full list.
                    </p>
                  ) : null}
                </div>
              )}
            </FacultyPanel>
          )}

          {(report.kind === 'full' || report.kind === 'assignments') && (
            <FacultyPanel
              title="Assignments"
              count={report.assignments.length}
              description="Posted work and submission counts for this course"
            >
              {report.assignments.length === 0 ? (
                <FacultyEmptyState description="No assignments found for this course." />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Title</th>
                        <th className="px-3 py-2 font-medium">Due</th>
                        <th className="px-3 py-2 text-right font-medium">Max</th>
                        <th className="px-3 py-2 text-right font-medium">Submissions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.assignments.map((a, i) => (
                        <tr key={`${a.title}-${i}`} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium text-sgvu-navy">{a.title}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {a.due_date
                              ? new Date(a.due_date).toLocaleDateString('en-IN')
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {a.max_marks ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-sgvu-navy">
                            {a.submission_count ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </FacultyPanel>
          )}
        </div>
      ) : null}

      <FacultyPanel
        title="Related workspaces"
        description="Open interactive analytics and grading views"
        className="print:hidden"
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: '/faculty/analytics', label: 'Student Analytics', icon: LineChart },
            { href: '/faculty/attendance', label: 'Mark Attendance', icon: Users },
            { href: '/faculty/grading', label: 'Examinations & Grading', icon: FileSpreadsheet },
            { href: '/faculty/weekly-tests', label: 'Weekly Tests Results', icon: ClipboardList },
          ].map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex h-11 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-sm font-semibold text-sgvu-navy transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
              >
                <Icon className="h-4 w-4 text-sgvu-gold" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </FacultyPanel>
    </FacultyPageShell>
  );
}
