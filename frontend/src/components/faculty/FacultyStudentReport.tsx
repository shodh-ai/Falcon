'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BookOpen, Circle, GraduationCap, ShieldAlert } from 'lucide-react';
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
};

function scoreColor(pct: number) {
  if (pct < 40) return '#dc2626';
  if (pct < 60) return '#d97706';
  return '#08234a';
}

function flagVariant(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (severity === 'HIGH') return 'destructive';
  if (severity === 'MEDIUM') return 'secondary';
  return 'outline';
}

function assignmentStatusColor(status: string) {
  if (status === 'PENDING') return '#dc2626';
  if (status === 'SUBMITTED') return '#d97706';
  return '#059669';
}

function assignmentBadge(status: string) {
  if (status === 'PENDING') return 'destructive';
  if (status === 'SUBMITTED') return 'secondary';
  return 'outline';
}

function formatPercent(value: number) {
  return `${Math.round(Number(value ?? 0))}%`;
}

function formatScore(value: number | null, max: number) {
  if (value == null) return 'Not graded';
  return `${value}/${max}`;
}

export function FacultyStudentReport({ report }: { report: FacultyStudentReportData }) {
  const { student, subject, summary, academic, marks, assignments, demerits, risk_flags } = report;

  const assessmentChart = marks.map((m) => ({
    name: m.exam_type,
    score: Math.round(Number(m.percent ?? 0)),
  }));

  const standingChart = [
    { name: 'Student', score: summary.internal_avg_percent },
    { name: 'Class avg', score: summary.class_average_percent },
  ];

  const assignmentChart = [
    { name: 'Submitted', count: summary.assignments_submitted },
    { name: 'Pending', count: summary.pending_assignments },
  ];

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
            {academic ? <FacultyMetricChip label="CGPA" value={academic.cgpa || 'N/A'} /> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <FacultyPanel title="Subject Standing" description="Student score compared with this class average">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={standingChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`${value}%`, 'Score']} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {standingChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.name === 'Student' ? scoreColor(entry.score) : '#d6b65d'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FacultyPanel>

        <FacultyPanel title="Assessment Scores" description="Published marks in this subject">
          {assessmentChart.length === 0 ? (
            <FacultyEmptyState description="No published marks for this student yet." className="py-6" />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assessmentChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => [`${value}%`, 'Score']} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {assessmentChart.map((entry) => (
                      <Cell key={entry.name} fill={scoreColor(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel title="Assignment Status" description="Digital assignment completion in this subject">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assignmentChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {assignmentChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.name === 'Pending' ? '#dc2626' : '#059669'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FacultyPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FacultyPanel title="Key Faculty Signals" count={risk_flags.length}>
          {risk_flags.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
              <GraduationCap className="h-4 w-4 shrink-0" />
              No non-attendance concern flags for this subject.
            </div>
          ) : (
            <div className="space-y-3">
              {risk_flags.map((flag) => (
                <div key={flag.label} className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-sgvu-navy">{flag.label}</span>
                    <Badge variant={flagVariant(flag.severity)} className="text-[10px]">{flag.severity}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{flag.detail}</p>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel title="Academic Record" description="Latest overall academic snapshot, excluding attendance">
          {academic ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">SGPA / CGPA</p>
                <p className="text-lg font-bold text-sgvu-navy">
                  {academic.sgpa || 'N/A'} / {academic.cgpa || 'N/A'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Backlogs</p>
                <p className={cn('text-lg font-bold', academic.backlog_count > 0 ? 'text-red-700' : 'text-sgvu-navy')}>
                  {academic.backlog_count}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Progression</p>
                <p className="font-semibold text-sgvu-navy">{academic.progression_status || 'N/A'}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Record</p>
                <p className="font-semibold text-sgvu-navy">
                  Sem {academic.semester} · {academic.academic_year}
                </p>
              </div>
              {academic.remarks ? (
                <p className="sm:col-span-2 rounded-xl border border-border/60 bg-background p-3 text-sm text-muted-foreground">
                  {academic.remarks}
                </p>
              ) : null}
            </div>
          ) : (
            <FacultyEmptyState description="No academic record is available for this student yet." className="py-6" />
          )}
        </FacultyPanel>
      </div>

      <FacultyPanel
        title="Discipline / Black Dots"
        count={demerits.length}
        description="DC-approved demerit incidents for this subject"
      >
        {summary.course_demerit_points === 0 && demerits.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            No approved demerit incidents in this subject.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3">
              <Circle className="h-4 w-4 fill-red-700 text-red-700" />
              <span className="text-sm font-semibold text-red-950">
                {summary.course_demerit_points} subject demerit point
                {summary.course_demerit_points === 1 ? '' : 's'}
              </span>
              {summary.is_subject_back_triggered ? <Badge variant="destructive">Subject back triggered</Badge> : null}
            </div>
            {demerits.map((d) => (
              <div key={d.incident_id} className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Circle className="h-3 w-3 fill-red-600 text-red-600" />
                  <span className="font-semibold text-sgvu-navy">{d.category.replace(/_/g, ' ')}</span>
                  <Badge variant="outline" className="text-[10px]">{d.course_code}</Badge>
                  <Badge variant="secondary" className="text-[10px]">+{d.points} pts</Badge>
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

      <FacultyPanel title="Assignment Details" count={assignments.length}>
        {assignments.length === 0 ? (
          <FacultyEmptyState description="No assignments have been posted in this subject yet." className="py-6" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {assignments.map((assignment) => (
              <div key={assignment.assignment_id} className="rounded-xl border border-border/60 bg-background p-4 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sgvu-navy">{assignment.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {new Date(assignment.due_date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={assignmentBadge(assignment.status)} className="text-[10px]">
                    {assignment.status}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <p className="text-muted-foreground">Marks</p>
                    <p className="font-bold">{formatScore(assignment.marks_awarded, assignment.max_marks)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <p className="text-muted-foreground">Submitted</p>
                    <p className="font-bold">
                      {assignment.submitted_at ? new Date(assignment.submitted_at).toLocaleDateString() : 'No'}
                    </p>
                  </div>
                </div>
                {assignment.faculty_remarks ? (
                  <p className="mt-3 text-xs text-muted-foreground">{assignment.faculty_remarks}</p>
                ) : (
                  <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <BookOpen className="h-3 w-3" />
                    No faculty remarks yet
                  </p>
                )}
                <div
                  className="mt-3 h-1.5 rounded-full"
                  style={{ backgroundColor: assignmentStatusColor(assignment.status) }}
                />
              </div>
            ))}
          </div>
        )}
      </FacultyPanel>
    </div>
  );
}
