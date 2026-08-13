'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { AlertTriangle, Circle, GraduationCap, ShieldAlert } from 'lucide-react';
import {
  FacultyMetricChip,
  FacultyPanel,
  FacultyEmptyState,
} from '@/components/faculty';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type FacultyStudentReportData = {
  student: {
    student_user_id: string;
    name: string;
    official_email: string;
    roll_number: string;
    batch: string | null;
    department: string | null;
  };
  subject: {
    course_id: string;
    course_code: string;
    course_name: string;
  };
  summary: {
    internal_avg_percent: number;
    class_average_percent: number;
    class_rank: number;
    class_size: number;
    cumulative_demerit_points: number;
    course_demerit_points: number;
    is_subject_back_triggered: boolean;
    assignments_submitted: number;
    assignments_total: number;
    assignments_graded: number;
    pending_assignments: number;
    assignment_completion_percent: number;
    graded_assignment_avg_percent: number;
  };
  academic: {
    academic_year: string;
    semester: number;
    sgpa: number;
    cgpa: number;
    backlog_count: number;
    progression_status: string;
    remarks: string | null;
  } | null;
  marks: Array<{
    exam_type: string;
    marks_obtained: number;
    max_marks: number;
    percent: number;
  }>;
  assignments: Array<{
    assignment_id: string;
    title: string;
    max_marks: number;
    due_date: string;
    submitted_at: string | null;
    marks_awarded: number | null;
    faculty_remarks: string | null;
    status: 'PENDING' | 'SUBMITTED' | 'GRADED';
  }>;
  demerits: Array<{
    incident_id: string;
    category: string;
    points: number;
    description: string;
    status: string;
    course_code: string;
    created_at: string;
  }>;
  risk_flags: Array<{
    label: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    detail: string;
  }>;
  gpa_history?: Array<{
    semester: number;
    sgpa: number;
    cgpa: number;
    status: string;
    academic_year: string | null;
    source: string;
  }>;
};

function flagVariant(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (severity === 'HIGH') return 'destructive';
  if (severity === 'MEDIUM') return 'secondary';
  return 'outline';
}

function formatPercent(value: number) {
  return `${Math.round(Number(value ?? 0))}%`;
}

export function FacultyStudentReport({ report }: { report: FacultyStudentReportData }) {
  const { student, subject, summary, academic } = report;
  const assignments = report.assignments ?? [];
  const demerits = report.demerits ?? [];
  const risk_flags = report.risk_flags ?? [];
  const gpaHistory = report.gpa_history ?? [];
  const latestGpa = gpaHistory.length ? gpaHistory[gpaHistory.length - 1] : null;
  const academicSnapshot = academic ?? (latestGpa
    ? {
        academic_year: latestGpa.academic_year ?? '—',
        semester: latestGpa.semester,
        sgpa: latestGpa.sgpa,
        cgpa: latestGpa.cgpa,
        backlog_count: 0,
        progression_status: latestGpa.status,
        remarks: null,
      }
    : null);

  const gpaChartData = gpaHistory.map((row) => ({
    semester: row.semester,
    label: `Sem ${row.semester}`,
    sgpa: Number(row.sgpa ?? 0),
    cgpa: Number(row.cgpa ?? 0),
  }));

  const sortedAssignments = [...assignments].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
  );

  const matchedPanelBodyClass = 'flex h-[24rem] flex-col';

  const gpaHistoryPanel = (
    <>
      {gpaHistory.length === 0 ? (
        <FacultyEmptyState description="No semester-wise SGPA or CGPA history is available for this student yet." className="py-6" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto">
          <div className="h-48 w-full shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gpaChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [Number(value).toFixed(2), name]}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sgpa"
                  name="SGPA"
                  stroke="#d6b65d"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#d6b65d' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="cgpa"
                  name="CGPA"
                  stroke="#08234a"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#08234a' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Semester</th>
                  <th className="px-3 py-2 font-medium">SGPA</th>
                  <th className="px-3 py-2 font-medium">CGPA</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {gpaHistory.map((row) => (
                  <tr key={row.semester} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-sgvu-navy">Sem {row.semester}</td>
                    <td className="px-3 py-2">{Number(row.sgpa).toFixed(2)}</td>
                    <td className="px-3 py-2">{Number(row.cgpa).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {row.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  const hasConcerns =
    risk_flags.length > 0 ||
    summary.course_demerit_points > 0 ||
    Number(academic?.backlog_count ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sgvu-gold/30 bg-gradient-to-br from-sgvu-gold/10 via-white to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-sgvu-navy">{student.name}</h2>
              {hasConcerns ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Needs attention
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">On track</Badge>
              )}
              {summary.is_subject_back_triggered ? <Badge variant="destructive">Subject back</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {student.roll_number} · {student.official_email}
            </p>
            <p className="text-xs text-muted-foreground">
              {subject.course_code} · {subject.course_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {[student.department, student.batch ? `Batch ${student.batch}` : null].filter(Boolean).join(' · ') ||
                'Department not set'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FacultyMetricChip label="Internal score" value={formatPercent(summary.internal_avg_percent)} emphasis />
            <FacultyMetricChip
              label="Class rank"
              value={summary.class_size ? `${summary.class_rank}/${summary.class_size}` : 'N/A'}
            />
            <FacultyMetricChip label="Assignments" value={`${summary.assignments_submitted}/${summary.assignments_total}`} />
            <FacultyMetricChip label="Demerits" value={summary.course_demerit_points} />
            {academicSnapshot ? <FacultyMetricChip label="CGPA" value={academicSnapshot.cgpa || 'N/A'} /> : null}
          </div>
        </div>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <FacultyPanel
          title="Semester-wise SGPA & CGPA"
          description="Grade point trend for each semester across the student's program"
          count={gpaHistory.length}
          className="flex h-full min-h-0 flex-col"
          contentClassName={matchedPanelBodyClass}
        >
          {gpaHistoryPanel}
        </FacultyPanel>

        <FacultyPanel
          title="Assignment Status"
          description="Submitted assignments in green, pending in red"
          count={sortedAssignments.length}
          className="flex h-full min-h-0 flex-col"
          contentClassName={cn(matchedPanelBodyClass, 'min-h-0')}
        >
          {sortedAssignments.length === 0 ? (
            <FacultyEmptyState description="No assignments have been posted in this subject yet." className="py-6" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {sortedAssignments.map((assignment, index) => {
                  const done = assignment.status !== 'PENDING';
                  const assignmentNo = index + 1;
                  return (
                    <li
                      key={assignment.assignment_id}
                      className="flex items-start gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm"
                    >
                      <span className="mt-0.5 shrink-0 text-xs font-bold tabular-nums text-sgvu-navy">
                        {assignmentNo}
                      </span>
                      <Circle
                        className={cn(
                          'mt-1.5 h-2.5 w-2.5 shrink-0 fill-current',
                          done ? 'text-emerald-500' : 'text-red-500',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug text-sgvu-navy">
                          Assignment {assignmentNo} · {assignment.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Due {new Date(assignment.due_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {done ? (
                          assignment.marks_awarded != null ? (
                            <div>
                              <p className="font-semibold text-sgvu-navy">
                                {assignment.marks_awarded}/{assignment.max_marks}
                              </p>
                              <p className="text-muted-foreground">
                                {Math.round(
                                  (Number(assignment.marks_awarded) / Number(assignment.max_marks || 1)) * 100,
                                )}
                                %
                              </p>
                            </div>
                          ) : (
                            <span className="font-medium text-emerald-700">Awaiting grade</span>
                          )
                        ) : (
                          <span className="font-medium text-red-600">Not submitted</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 shrink-0 space-y-3 border-t border-border/60 pt-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Completion</span>
                    <span className="font-bold text-sgvu-navy">{summary.assignment_completion_percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(summary.assignment_completion_percent, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-emerald-700">{summary.assignments_submitted}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/80">Submitted</p>
                  </div>
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-red-700">{summary.pending_assignments}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-red-800/80">Pending</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-sgvu-navy">{summary.assignments_graded}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Graded</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </FacultyPanel>
      </div>

      {/* Bottom row: equal width + equal height cards */}
      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FacultyPanel
          title="Key Faculty Signals"
          count={risk_flags.length}
          className="flex h-full min-h-[14rem] flex-col"
          contentClassName="flex flex-1 flex-col"
        >
          {risk_flags.length === 0 ? (
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
              <GraduationCap className="h-4 w-4 shrink-0" />
              No non-attendance concern flags for this subject.
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto">
              {risk_flags.map((flag) => (
                <div key={flag.label} className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-sgvu-navy">{flag.label}</span>
                    <Badge variant={flagVariant(flag.severity)} className="text-[10px]">
                      {flag.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{flag.detail}</p>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel
          title="Academic Record"
          description="Latest overall academic snapshot, excluding attendance"
          className="flex h-full min-h-[14rem] flex-col"
          contentClassName="flex flex-1 flex-col"
        >
          {academicSnapshot ? (
            <div className="grid flex-1 content-start gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Backlogs</p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    academicSnapshot.backlog_count > 0 ? 'text-red-700' : 'text-sgvu-navy',
                  )}
                >
                  {academicSnapshot.backlog_count}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Progression</p>
                <p className="font-semibold text-sgvu-navy">
                  {academicSnapshot.progression_status || 'N/A'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="font-semibold text-sgvu-navy">
                  Sem {academicSnapshot.semester} · {academicSnapshot.academic_year}
                </p>
              </div>
              {academicSnapshot.remarks ? (
                <p className="rounded-xl border border-border/60 bg-background p-3 text-sm text-muted-foreground sm:col-span-2">
                  {academicSnapshot.remarks}
                </p>
              ) : null}
            </div>
          ) : (
            <FacultyEmptyState
              description="No academic record is available for this student yet."
              className="flex-1 py-6"
            />
          )}
        </FacultyPanel>

        <FacultyPanel
          title="Discipline / Black Dots"
          count={demerits.length}
          description="DC-approved demerit incidents for this subject"
          className="flex h-full min-h-[14rem] flex-col md:col-span-2 xl:col-span-1"
          contentClassName="flex flex-1 flex-col"
        >
          {summary.course_demerit_points === 0 && demerits.length === 0 ? (
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              No approved demerit incidents in this subject.
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
                <Circle className="h-4 w-4 fill-red-700 text-red-700" />
                <span className="text-sm font-semibold text-red-950">
                  {summary.course_demerit_points} subject demerit point
                  {summary.course_demerit_points === 1 ? '' : 's'}
                </span>
                {summary.is_subject_back_triggered ? (
                  <Badge variant="destructive">Subject back triggered</Badge>
                ) : null}
              </div>
              {demerits.map((d) => (
                <div key={d.incident_id} className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Circle className="h-3 w-3 fill-red-600 text-red-600" />
                    <span className="font-semibold text-sgvu-navy">{d.category.replace(/_/g, ' ')}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {d.course_code}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      +{d.points} pts
                    </Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{d.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>
      </div>
    </div>
  );
}
