'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, CalendarDays, ClipboardCheck, Clock3, GraduationCap,
  MapPin, Shield, TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import {
  PIPELINE_ICONS, ResultPublishingPipeline, type PipelineStep,
} from '@/components/exam-cell/ResultPublishingPipeline';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction, type ExamCellAction } from '@/lib/exam-cell-rbac';

type DashboardStats = {
  dashboard_date: string;
  timezone: string;
  upcoming_exams_preview: TodayExam[];
  pending_registrations: number;
  question_papers_awaiting_review?: number;
  metric_errors?: Record<string, string>;
  recent_activity_error?: string;
  upcoming_exams: number;
  todays_exams: number;
  active_exam_sessions: number;
  registered_students: number;
  todays_attendance: number;
  pending_coe_marks: number;
  pending_results: number;
  re_evaluations_queue: number;
  pending_supplementary: number;
  invigilators_assigned_today: number;
  open_ufm_cases: number;
  result_status_chart: { label: string; count: number }[];
  recent_activity: {
    audit_id: string;
    action: string;
    resource_type: string;
    created_at: string;
    actor_name: string | null;
  }[] | null;
};

type TodayExam = {
  exam_schedule_id: string;
  exam_type: string;
  exam_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  subject_name: string | null;
  subject_code: string | null;
};

type ResultSession = {
  session_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  semester: number | null;
  entry_status: 'OPEN' | 'CLOSED' | 'LOCKED';
  marks_locked: boolean;
  declared_at: string | null;
  coe_audit_status?: 'idle' | 'passed' | 'anomaly';
  dean_approved?: boolean;
  dean_approval_status?: string | null;
};

type Api = ReturnType<typeof useAuthedApi>;
type Resource<T> = { data: T | null; error: string | null; loading: boolean; loadedAt: string | null };
type SessionFilter = 'all' | 'pending' | 'declared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isExam(value: unknown): boolean {
  return isRecord(value) && typeof value.exam_schedule_id === 'string'
    && typeof value.exam_date === 'string'
    && ['exam_type', 'start_time', 'end_time', 'venue', 'subject_name', 'subject_code']
      .every((key) => value[key] == null || typeof value[key] === 'string');
}

function isTimetable(value: unknown): boolean {
  return Array.isArray(value) && value.every(isExam);
}

function isResultSession(value: unknown): boolean {
  return isRecord(value) && ['session_id', 'course_code', 'course_name', 'exam_type', 'entry_status']
    .every((key) => typeof value[key] === 'string') && typeof value.marks_locked === 'boolean'
    && (value.declared_at === null || typeof value.declared_at === 'string');
}

function isResultList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isResultSession);
}

function isSummary(value: unknown): boolean {
  return isRecord(value) && typeof value.dashboard_date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.dashboard_date) && typeof value.timezone === 'string'
    && isTimetable(value.upcoming_exams_preview)
    && ['upcoming_exams', 'todays_exams', 'active_exam_sessions', 'registered_students',
      'todays_attendance', 'pending_coe_marks', 'pending_results', 're_evaluations_queue',
      'pending_supplementary', 'invigilators_assigned_today', 'open_ufm_cases', 'pending_registrations']
      .every((key) => isCount(value[key]))
    && (value.question_papers_awaiting_review === undefined || isCount(value.question_papers_awaiting_review))
    && Array.isArray(value.result_status_chart)
    && value.result_status_chart.every((row) => isRecord(row) && typeof row.label === 'string' && isCount(row.count))
    && ((value.recent_activity === null && typeof value.recent_activity_error === 'string')
      || (Array.isArray(value.recent_activity) && value.recent_activity.every((row) => isRecord(row)
        && ['audit_id', 'action', 'resource_type', 'created_at'].every((key) => typeof row[key] === 'string')
        && (row.actor_name === null || typeof row.actor_name === 'string'))));
}

// Bind each response to its API/auth context, path and refresh. Late responses
// must never display a previous session's approval state or another login's data.
function useDashboardResource<T>(api: Api, path: string | null, revision: number, scope: string, validate: (value: unknown) => boolean): Resource<T> {
  const [state, setState] = useState<{
    api: Api; path: string; revision: number; scope: string; data: T | null; error: string | null; loadedAt: string | null;
  } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    void api.get<T>(path).then(
      (data) => {
        const error = data == null ? 'The server returned no data.'
          : !validate(data) ? 'The server returned invalid dashboard data.' : null;
        if (active) setState({ api, path, revision, scope, data: error ? null : data,
          error, loadedAt: error ? null : new Date().toISOString() });
      },
      (error: unknown) => {
        if (active) setState({
          api, path, revision, scope, data: null, loadedAt: null,
          error: error instanceof Error ? error.message : 'The request failed.',
        });
      },
    );
    return () => { active = false; };
  }, [api, path, revision, scope, validate]);

  if (!path) return { data: null, error: null, loading: false, loadedAt: null };
  if (state?.api !== api || state.path !== path || state.revision !== revision || state.scope !== scope) {
    return { data: null, error: null, loading: true, loadedAt: null };
  }
  return { data: state.data, error: state.error, loading: false, loadedAt: state.loadedAt };
}

function readable(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ') : 'Not available';
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function publicationSteps(session: ResultSession): PipelineStep[] {
  const locked = session.marks_locked === true && session.entry_status === 'LOCKED';
  const auditPassed = session.coe_audit_status === 'passed';
  const anomaly = session.coe_audit_status === 'anomaly';
  const approved = session.dean_approved === true;
  const rejected = !approved && session.dean_approval_status === 'REJECTED';
  return [
    {
      key: 'faculty_lock', label: 'Faculty lock', icon: PIPELINE_ICONS.faculty_lock,
      description: 'Marks entry locked before review.',
      status: locked ? 'complete' : 'pending',
      statusLabel: locked ? 'Marks locked' : 'Awaiting lock',
    },
    {
      key: 'coe_audit', label: 'COE audit', icon: PIPELINE_ICONS.coe_audit,
      description: 'Review marks and formula anomalies.',
      status: auditPassed ? 'complete' : anomaly ? 'blocked' : locked ? 'active' : 'pending',
      statusLabel: auditPassed ? 'Audit passed' : anomaly ? 'Anomaly detected'
        : session.coe_audit_status === 'idle' ? 'Current COE audit required' : 'Status unavailable',
    },
    {
      key: 'dean_approval', label: 'Dean approval', icon: PIPELINE_ICONS.dean_approval,
      description: 'Required approval before declaration.',
      status: approved ? 'complete' : rejected ? 'blocked' : auditPassed ? 'active' : 'pending',
      statusLabel: approved ? 'Approved' : rejected ? 'Approval rejected'
        : session.dean_approved === false ? 'Current Dean approval required' : 'Status unavailable',
    },
    {
      key: 'publish', label: 'Exam Cell publication', icon: PIPELINE_ICONS.publish,
      description: 'Official declaration in Result Control.',
      status: session.declared_at ? 'complete' : 'pending',
      statusLabel: session.declared_at ? 'Declared' : 'Not declared',
    },
  ];
}

function LoadError({ label, error, retry }: { label: string; error: string; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div><p className="font-semibold">{label}</p><p className="mt-1 break-words">{error}</p></div>
      <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
    </div>
  );
}

const quickActions: { label: string; href: string; permission?: ExamCellAction }[] = [
  { label: 'My tasks inbox', href: '/exam-cell/my-tasks' },
  { label: 'Exam registrations', href: '/exam-cell/form-fillup' },
  { label: 'Check Hall Ticket readiness', href: '/exam-cell/admit-cards', permission: 'generate_admit_cards' },
  { label: 'Allocate seating', href: '/exam-cell/seating', permission: 'manage_seating' },
  { label: 'Results & Publication', href: '/exam-cell/results' },
  { label: 'Global search', href: '/exam-cell/search' },
];

export default function ExamCellDashboardPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const role = user?.primaryRole ?? user?.role;
  const scope = `${user?.user_id ?? ''}:${user?.tenant_id ?? ''}:${role ?? ''}`;
  const [revision, setRevision] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');
  const [showAllExams, setShowAllExams] = useState(false);
  const summary = useDashboardResource<DashboardStats>(api, user ? '/api/exam-cell/dashboard' : null, revision, scope, isSummary);
  const timetable = useDashboardResource<TodayExam[]>(api, summary.data?.dashboard_date
    ? `/api/exam-cell/exam-day/today?date=${encodeURIComponent(summary.data.dashboard_date)}` : null, revision, scope, isTimetable);
  const sessions = useDashboardResource<ResultSession[]>(api, user ? '/api/exam-cell/result-control/sessions' : null, revision, scope, isResultList);
  const visibleSessions = sessions.data?.filter((session) => sessionFilter === 'all'
    || (sessionFilter === 'declared' ? Boolean(session.declared_at) : !session.declared_at));
  const selected = visibleSessions?.find((session) => session.session_id === selectedSessionId)
    ?? visibleSessions?.find((session) => !session.declared_at)
    ?? visibleSessions?.[0];
  const detail = useDashboardResource<ResultSession>(
    api,
    selected ? `/api/exam-cell/result-control/sessions/${selected.session_id}` : null,
    revision,
    scope,
    isResultSession,
  );
  const stats = summary.data;
  const refresh = () => {
    setShowAllExams(false);
    setRevision((current) => current + 1);
  };
  const count = (value: number | undefined) => typeof value !== 'number' || !Number.isFinite(value) ? '—' : value.toLocaleString('en-IN');
  const loading = summary.loading || timetable.loading || sessions.loading || detail.loading;
  const errors = summary.error || timetable.error || sessions.error || detail.error || stats?.recent_activity_error
    || (stats?.metric_errors && Object.keys(stats.metric_errors).length > 0);
  const lastUpdated = !loading && !errors && summary.loadedAt && timetable.loadedAt && sessions.loadedAt
    ? [summary.loadedAt, timetable.loadedAt, sessions.loadedAt, ...(detail.loadedAt ? [detail.loadedAt] : [])].sort().at(-1)
    : null;
  const showingUpcoming = timetable.data?.length === 0;
  const exams = timetable.data?.length ? timetable.data : stats?.upcoming_exams_preview;
  const timetableError = timetable.error || summary.error || (stats && !stats.dashboard_date ? 'Examination date is unavailable.' : null);

  const metrics = [
    { label: "Today's exams", value: stats?.todays_exams, description: 'Scheduled for today', icon: CalendarDays, href: '/exam-cell/schedule' },
    { label: 'Active sessions', value: stats?.active_exam_sessions, description: 'Open or active exam sessions', icon: GraduationCap, href: '/exam-cell/sessions' },
    { label: 'Pending results', value: stats?.pending_results, description: 'Result sessions not yet declared', icon: TrendingUp, href: '/exam-cell/results' },
    { label: 'Re-evaluation queue', value: stats?.re_evaluations_queue, description: 'Applications awaiting completion', icon: ClipboardCheck, href: '/exam-cell/re-evaluations' },
  ];
  const attention = [
    { label: 'Pending registrations', value: stats?.pending_registrations, description: 'Registration records awaiting a decision.', icon: ClipboardCheck, href: '/exam-cell/form-fillup', action: canExamCellAction(role, 'manage_sessions') ? 'Review registrations' : 'View registrations' },
    { label: 'Question papers awaiting review', value: stats?.question_papers_awaiting_review, description: 'Uploaded versions currently under moderation.', icon: ClipboardCheck, href: '/exam-cell/question-papers', action: canExamCellAction(role, 'manage_qp') ? 'Review question papers' : 'View question papers' },
    { label: 'Marks awaiting COE review', value: stats?.pending_coe_marks, description: 'Mark records pending review, not a count of students.', icon: ClipboardCheck, href: '/exam-cell/results', action: canExamCellAction(role, 'manage_sessions') ? 'Review marks' : 'View marks' },
    { label: 'Open malpractice cases', value: stats?.open_ufm_cases, description: 'Unclosed cases across all dates. Case history has its own date filters.', icon: Shield, href: '/exam-cell/ufm-cases', action: canExamCellAction(role, 'approve_ufm') ? 'Review cases' : 'View cases' },
  ];
  const overview = [
    { label: 'Upcoming exams', value: stats?.upcoming_exams, href: '/exam-cell/schedule' },
    { label: 'Students with exam records', value: stats?.registered_students, href: '/exam-cell/form-fillup' },
    { label: "Attendance records for today’s exams", value: stats?.todays_attendance, href: '/exam-cell/exam-day' },
    { label: 'Supplementary pending', value: stats?.pending_supplementary, href: '/exam-cell/backlog-exams' },
    { label: 'Invigilators today', value: stats?.invigilators_assigned_today, href: '/exam-cell/invigilation' },
  ];
  const chartData = (stats?.result_status_chart ?? []).map((row) => ({
    name: readable(row.label), count: row.count,
  }));

  if (!user) return <p role="alert" className="p-6 text-sm text-muted-foreground">Sign in to view the examination dashboard.</p>;

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 md:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-sgvu-navy to-[#173d66] p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sgvu-gold">Controller of Examinations</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Examination Dashboard</h1>
            <p className="mt-2 text-sm text-white/80">Today’s exams, pending work, and result progress.</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <p>Tenant-wide totals. The result session selector affects result progress only.</p>
        <p role="status">{loading ? 'Updating dashboard…' : errors ? 'Some data is unavailable; refresh to retry.'
          : lastUpdated ? `Last updated: ${displayDate(lastUpdated)} (IST)` : 'Update time unavailable.'}</p>
      </div>

      {summary.loading && <p role="status" className="text-sm text-muted-foreground">Loading dashboard summary…</p>}
      {summary.error && <LoadError label="Dashboard summary unavailable" error={summary.error} retry={refresh} />}
      <section aria-label="Key examination metrics" aria-busy={summary.loading} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, description, icon: Icon, href }) => (
          <Link key={label} href={href} className="group min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold">
            <Card className="h-full border-t-4 border-t-sgvu-gold transition-[border-color,box-shadow] group-hover:border-sgvu-gold group-hover:shadow-md group-focus-visible:shadow-md">
              <CardContent className="grid h-full grid-rows-[auto_1fr_auto] gap-3 pt-5">
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-sgvu-navy" />
                </div>
                <p className="text-3xl font-bold tabular-nums text-sgvu-navy">{count(value)}</p>
                <p className="min-h-8 text-xs leading-4 text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <section aria-labelledby="attention-title" className="min-w-0">
          <Card className="flex h-full flex-col">
            <CardHeader className="min-h-24"><CardTitle id="attention-title">Needs attention</CardTitle><p className="text-sm text-muted-foreground">Start with the work waiting for your team.</p></CardHeader>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-2" aria-busy={summary.loading}>
              {summary.error ? <p className="text-sm text-muted-foreground">Attention counts are unavailable. Retry the dashboard summary above.</p> : attention.map(({ label, value, description, icon: Icon, href, action }) => (
                <div key={label} className="rounded-xl border border-border bg-slate-50/70 p-3">
                  <div className="flex items-start gap-3">
                    <Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-sgvu-navy" />
                    <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-sgvu-navy">{label}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
                    <span className="text-xl font-bold tabular-nums text-sgvu-navy">{count(value)}</span>
                  </div>
                  {!summary.loading && value == null && <p className="mt-2 text-xs text-amber-800">Data unavailable.</p>}
                  <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0 text-sgvu-navy"><Link href={href}>{action} <ArrowRight aria-hidden="true" /></Link></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="timetable-title" className="min-w-0">
          <Card className="flex h-full flex-col">
            <CardHeader className="min-h-24 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle id="timetable-title">Today’s timetable</CardTitle>
              <Button asChild size="sm" variant="link"><Link href="/exam-cell/schedule">View full schedule <ArrowRight aria-hidden="true" /></Link></Button>
            </CardHeader>
            <CardContent id="dashboard-timetable" className="flex-1 space-y-3 pt-5" aria-busy={summary.loading || timetable.loading}>
              {summary.loading || timetable.loading ? <p role="status" className="text-sm text-muted-foreground">Loading today’s exams…</p>
                : timetableError ? <LoadError label="Timetable unavailable" error={timetableError} retry={refresh} />
                  : !Array.isArray(exams) ? <p className="text-sm text-muted-foreground">Timetable data unavailable.</p>
                  : !exams.length ? <p className="py-4 text-sm text-muted-foreground">No exams scheduled today or upcoming.</p>
                    : <>
                      <p className="text-xs text-muted-foreground">{showingUpcoming ? 'No exams today. Next upcoming exams' : 'Today’s exams'} · {stats?.timezone}</p>
                      {(showAllExams ? exams : exams.slice(0, 4)).map((exam) => (
                        <div key={exam.exam_schedule_id} className="rounded-xl border border-border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy"><Clock3 aria-hidden="true" className="h-4 w-4" />{exam.start_time?.slice(0, 5) ?? 'Time not set'}{exam.end_time ? ` – ${exam.end_time.slice(0, 5)}` : ''}</p>
                            <Badge variant="outline">{readable(exam.exam_type)}</Badge>
                          </div>
                          {showingUpcoming && <p className="mt-2 text-xs text-muted-foreground">{exam.exam_date.slice(0, 10)}</p>}
                          <h3 className="mt-2 break-words text-sm font-semibold text-sgvu-navy">{exam.subject_name || exam.subject_code || 'Subject not specified'}</h3>
                          <p className="mt-1 flex items-start gap-2 break-words text-xs text-muted-foreground"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{exam.venue || 'Venue not assigned'}</span></p>
                        </div>
                      ))}
                      {exams.length > 4 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                          <p className="text-xs text-muted-foreground">Showing {showAllExams ? exams.length : 4} of {exams.length} exams.</p>
                          <Button variant="outline" size="sm" aria-expanded={showAllExams} aria-controls="dashboard-timetable" onClick={() => setShowAllExams((current) => !current)}>
                            {showAllExams ? 'Show fewer exams' : `Show all ${exams.length} exams`}
                          </Button>
                        </div>
                      )}
                    </>}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="publication-title" className="min-w-0">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div><CardTitle id="publication-title">Result publication progress</CardTitle><p className="mt-2 text-sm text-muted-foreground">Track one result session through the existing approval workflow.</p></div>
            <Button asChild variant="outline" size="sm"><Link href="/exam-cell/results">Open Result Control <ArrowRight aria-hidden="true" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-5" aria-busy={sessions.loading || detail.loading}>
            {sessions.loading ? <p role="status" className="text-sm text-muted-foreground">Loading result sessions…</p>
              : sessions.error ? <LoadError label="Result sessions unavailable" error={sessions.error} retry={refresh} />
                : !sessions.data?.length ? <p className="text-sm text-muted-foreground">No result sessions available. Manage sessions in Result Control.</p>
                  : <>
                    <div role="group" aria-label="Filter result sessions" className="flex flex-wrap gap-2">
                      {([
                        ['all', 'All sessions'], ['pending', 'Awaiting declaration'], ['declared', 'Declared sessions'],
                      ] as const).map(([value, label]) => (
                        <Button key={value} size="sm" variant={sessionFilter === value ? 'default' : 'outline'} aria-pressed={sessionFilter === value} onClick={() => setSessionFilter(value)}>
                          {label}
                        </Button>
                      ))}
                    </div>
                    {!selected ? <p role="status" className="text-sm text-muted-foreground">No sessions match this filter. Choose another filter to see more.</p> : <>
                    <div className="w-full min-w-0 max-w-xl space-y-2">
                      <label htmlFor="dashboard-result-session" className="text-xs font-semibold text-muted-foreground">Result session</label>
                      <Select id="dashboard-result-session" className="min-w-0 max-w-full" value={selected.session_id} onChange={(event) => setSelectedSessionId(event.target.value)}>
                        {visibleSessions?.map((session) => (
                          <option key={session.session_id} value={session.session_id}>
                            {session.course_code} · {session.course_name} · {readable(session.exam_type)} · Semester {session.semester ?? '—'}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {detail.loading ? <p role="status" className="text-sm text-muted-foreground">Loading approval status…</p>
                      : detail.error ? <LoadError label="Approval status unavailable" error={detail.error} retry={refresh} />
                        : detail.data && <>
                          <ResultPublishingPipeline compact dashboardLayout steps={publicationSteps(detail.data)} />
                          {detail.data.declared_at && <p className="text-sm text-emerald-800">Declared on {displayDate(detail.data.declared_at)}.</p>}
                          {!detail.data.declared_at && <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                            <p className="text-muted-foreground">{detail.data.dean_approved === true
                              ? 'Current approval recorded. Additional declaration checks remain in Results & Publication.'
                              : 'Review the current lock, audit and approval requirements in Results & Publication. Detailed blocker information is not available from this read API.'}</p>
                            <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0"><Link href="/exam-cell/results">{canExamCellAction(role, 'publish_results') ? 'Review declaration checks'
                              : canExamCellAction(role, 'manage_sessions') ? 'Review result batch' : 'View result batch'}<ArrowRight aria-hidden="true" /></Link></Button>
                          </div>}
                        </>}
                    </>}
                    <p className="text-xs text-muted-foreground">Read-only progress. Result Control rechecks approvals and eligible marks before declaration; nothing is published from this dashboard.</p>
                  </>}
          </CardContent>
        </Card>
      </section>

      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <section aria-labelledby="quick-actions-title" className="min-w-0">
          <Card className="h-full">
            <CardHeader><CardTitle id="quick-actions-title">Quick actions</CardTitle></CardHeader>
            <CardContent className="grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-1">
              {quickActions.filter((action) => !action.permission || canExamCellAction(role, action.permission)).map((action) => <Button key={action.href} asChild variant="outline" className="h-auto min-h-11 justify-between whitespace-normal py-3 text-left hover:border-sgvu-gold"><Link href={action.href}>{action.label}<ArrowRight aria-hidden="true" /></Link></Button>)}
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">Hall Ticket readiness is diagnostic only. Legacy PDFs are not counted as officially issued tickets.</p>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="activity-title" className="min-w-0 lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><CardTitle id="activity-title">Recent audit activity</CardTitle><Button asChild size="sm" variant="link"><Link href="/exam-cell/audit-log">View all audit activity <ArrowRight aria-hidden="true" /></Link></Button></CardHeader>
            <CardContent className="space-y-3 pt-5" aria-busy={summary.loading}>
              {summary.loading ? <p role="status" className="text-sm text-muted-foreground">Loading activity…</p>
                : summary.error ? <p className="text-sm text-muted-foreground">Audit activity is unavailable. Retry the dashboard summary above.</p>
                  : stats?.recent_activity_error ? <LoadError label="Audit activity unavailable" error={stats.recent_activity_error} retry={refresh} />
                  : !Array.isArray(stats?.recent_activity) ? <p className="text-sm text-muted-foreground">Audit activity is unavailable.</p>
                  : !stats.recent_activity.length ? <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
                    : stats.recent_activity.slice(0, 5).map((row) => (
                      <div key={row.audit_id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 last:border-0">
                        <div className="min-w-0"><p className="break-words text-sm font-medium text-sgvu-navy">{readable(row.action)}</p><p className="mt-1 text-xs text-muted-foreground">{readable(row.resource_type)} · {row.actor_name || 'Actor unavailable'}</p></div>
                        <time dateTime={row.created_at} className="text-xs text-muted-foreground">{displayDate(row.created_at)}</time>
                      </div>
                    ))}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="overview-title">
        <Card>
          <CardHeader><CardTitle id="overview-title">Examination overview</CardTitle><p className="text-sm text-muted-foreground">Registration, preparation, and exam-day totals.</p></CardHeader>
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy={summary.loading}>
            {overview.map(({ label, value, href }) => (
              <Link key={label} href={href} className="min-w-0 rounded-xl border border-border p-4 transition-[border-color,box-shadow] hover:border-sgvu-gold hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold">
                <h3 className="text-xs text-muted-foreground">{label}</h3><p className="mt-2 text-xl font-bold tabular-nums text-sgvu-navy">{count(value)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
      <section aria-labelledby="result-status-title">
        <Card>
          <CardHeader>
            <CardTitle id="result-status-title">Declared result outcomes</CardTitle>
            <p className="text-sm text-muted-foreground">Pass, fail, withheld, and absent report counts for officially declared sessions. A student can have more than one report.</p>
          </CardHeader>
          <CardContent className="pt-5" aria-busy={summary.loading}>
            {summary.loading ? <p role="status" className="text-sm text-muted-foreground">Loading result summary…</p>
              : summary.error ? <p className="text-sm text-muted-foreground">Result summary is unavailable.</p>
                : !Array.isArray(stats?.result_status_chart) ? <p className="text-sm text-muted-foreground">Result summary is unavailable.</p>
                : !chartData.length ? <p className="text-sm text-muted-foreground">No officially declared result reports yet.</p>
                  : <>
                    <div className="h-56" aria-hidden="true">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">{chartData.map((row) => <li key={row.name}>{row.name}: {row.count}</li>)}</ul>
                  </>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
