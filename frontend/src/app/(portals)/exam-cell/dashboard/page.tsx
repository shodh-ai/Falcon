'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, CalendarDays, ClipboardCheck, Clock3, GraduationCap,
  MapPin, Shield, Ticket, TrendingUp,
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

type DashboardStats = {
  upcoming_exams: number;
  todays_exams: number;
  active_exam_sessions: number;
  registered_students: number;
  students_eligible: number;
  hall_tickets_generated: number;
  todays_attendance: number;
  form_registrations: number;
  pending_hall_tickets: number;
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
  }[];
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
type Resource<T> = { data: T | null; error: string | null; loading: boolean };
type SessionFilter = 'all' | 'pending' | 'declared';

// Bind each response to its API/auth context, path and refresh. Late responses
// must never display a previous session's approval state or another login's data.
function useDashboardResource<T>(api: Api, path: string | null, revision: number): Resource<T> {
  const [state, setState] = useState<{
    api: Api; path: string; revision: number; data: T | null; error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    void api.get<T>(path).then(
      (data) => {
        if (active) setState({ api, path, revision, data, error: null });
      },
      (error: unknown) => {
        if (active) setState({
          api, path, revision, data: null,
          error: error instanceof Error ? error.message : 'The request failed.',
        });
      },
    );
    return () => { active = false; };
  }, [api, path, revision]);

  if (!path) return { data: null, error: null, loading: false };
  if (state?.api !== api || state.path !== path || state.revision !== revision) {
    return { data: null, error: null, loading: true };
  }
  return { data: state.data, error: state.error, loading: false };
}

function readable(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ') : 'Not available';
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-IN');
}

function publicationSteps(session: ResultSession): PipelineStep[] {
  const locked = session.marks_locked || session.entry_status === 'LOCKED';
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
        : session.coe_audit_status === 'idle' ? 'Awaiting audit' : 'Status unavailable',
    },
    {
      key: 'dean_approval', label: 'Dean approval', icon: PIPELINE_ICONS.dean_approval,
      description: 'Required approval before declaration.',
      status: approved ? 'complete' : rejected ? 'blocked' : auditPassed ? 'active' : 'pending',
      statusLabel: approved ? 'Approved' : rejected ? 'Approval rejected'
        : session.dean_approved === false ? 'Awaiting approval' : 'Status unavailable',
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

const quickActions = [
  { label: 'My tasks inbox', href: '/exam-cell/my-tasks' },
  { label: 'Exam registrations', href: '/exam-cell/form-fillup' },
  { label: 'Generate hall tickets', href: '/exam-cell/admit-cards' },
  { label: 'Allocate seating', href: '/exam-cell/seating' },
  { label: 'Result Control', href: '/exam-cell/results' },
  { label: 'Global search', href: '/exam-cell/search' },
];

export default function ExamCellDashboardPage() {
  const api = useAuthedApi();
  const [revision, setRevision] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');
  const [showAllExams, setShowAllExams] = useState(false);
  const summary = useDashboardResource<DashboardStats>(api, '/api/exam-cell/dashboard', revision);
  const timetable = useDashboardResource<TodayExam[]>(api, '/api/exam-cell/exam-day/today', revision);
  const sessions = useDashboardResource<ResultSession[]>(api, '/api/exam-cell/result-control/sessions', revision);
  const visibleSessions = sessions.data?.filter((session) => sessionFilter === 'all'
    || (sessionFilter === 'declared' ? Boolean(session.declared_at) : !session.declared_at));
  const selected = visibleSessions?.find((session) => session.session_id === selectedSessionId)
    ?? visibleSessions?.find((session) => !session.declared_at)
    ?? visibleSessions?.[0];
  const detail = useDashboardResource<ResultSession>(
    api,
    selected ? `/api/exam-cell/result-control/sessions/${selected.session_id}` : null,
    revision,
  );
  const stats = summary.data;
  const refresh = () => {
    setShowAllExams(false);
    setRevision((current) => current + 1);
  };
  const count = (value: number | undefined) => value == null ? '—' : value.toLocaleString('en-IN');

  const metrics = [
    { label: "Today's exams", value: stats?.todays_exams, description: 'Scheduled for today', icon: CalendarDays, href: '/exam-cell/schedule' },
    { label: 'Active sessions', value: stats?.active_exam_sessions, description: 'Open or active exam sessions', icon: GraduationCap, href: '/exam-cell/sessions' },
    { label: 'Pending results', value: stats?.pending_results, description: 'Result sessions not yet declared', icon: TrendingUp, href: '/exam-cell/results' },
    { label: 'Re-evaluation queue', value: stats?.re_evaluations_queue, description: 'Applications awaiting completion', icon: ClipboardCheck, href: '/exam-cell/re-evaluations' },
  ];
  const attention = [
    { label: 'Marks awaiting COE review', value: stats?.pending_coe_marks, description: 'Mark records pending review, not a count of students.', icon: ClipboardCheck, href: '/exam-cell/results', action: 'Review marks' },
    { label: 'Admit cards to generate', value: stats?.pending_hall_tickets, description: 'Eligible admit-card entries without a generated PDF.', icon: Ticket, href: '/exam-cell/admit-cards', action: 'Open admit cards' },
    { label: 'Open malpractice cases', value: stats?.open_ufm_cases, description: 'Unclosed cases across all dates. Case history has its own date filters.', icon: Shield, href: '/exam-cell/ufm-cases', action: 'Review cases' },
  ];
  const overview = [
    { label: 'Upcoming exams', value: stats?.upcoming_exams, href: '/exam-cell/schedule' },
    { label: 'Registered students', value: stats?.registered_students, href: '/exam-cell/form-fillup' },
    { label: 'Students eligible', value: stats?.students_eligible, href: '/exam-cell/eligibility' },
    { label: 'Hall tickets generated', value: stats?.hall_tickets_generated, href: '/exam-cell/admit-cards' },
    { label: "Today's attendance", value: stats?.todays_attendance, href: '/exam-cell/exam-day' },
    { label: 'Form registrations', value: stats?.form_registrations, href: '/exam-cell/form-fillup' },
    { label: 'Supplementary pending', value: stats?.pending_supplementary, href: '/exam-cell/backlog-exams' },
    { label: 'Invigilators today', value: stats?.invigilators_assigned_today, href: '/exam-cell/invigilation' },
  ];
  const chartData = (stats?.result_status_chart ?? []).map((row) => ({
    name: readable(row.label), count: row.count,
  }));

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
            <CardContent className="space-y-3 pt-5" aria-busy={summary.loading}>
              {summary.error ? <p className="text-sm text-muted-foreground">Attention counts are unavailable. Retry the dashboard summary above.</p> : attention.map(({ label, value, description, icon: Icon, href, action }) => (
                <div key={label} className="rounded-xl border border-border bg-slate-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-sgvu-navy" />
                    <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-sgvu-navy">{label}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
                    <span className="text-xl font-bold tabular-nums text-sgvu-navy">{count(value)}</span>
                  </div>
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
            <CardContent id="dashboard-timetable" className="flex-1 space-y-3 pt-5" aria-busy={timetable.loading}>
              {timetable.loading ? <p role="status" className="text-sm text-muted-foreground">Loading today’s exams…</p>
                : timetable.error ? <LoadError label="Timetable unavailable" error={timetable.error} retry={refresh} />
                  : !timetable.data?.length ? <p className="py-6 text-sm text-muted-foreground">No exams scheduled for today.</p>
                    : <>
                      {(showAllExams ? timetable.data : timetable.data.slice(0, 4)).map((exam) => (
                        <div key={exam.exam_schedule_id} className="rounded-xl border border-border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy"><Clock3 aria-hidden="true" className="h-4 w-4" />{exam.start_time?.slice(0, 5) ?? 'Time not set'}{exam.end_time ? ` – ${exam.end_time.slice(0, 5)}` : ''}</p>
                            <Badge variant="outline">{readable(exam.exam_type)}</Badge>
                          </div>
                          <h3 className="mt-2 break-words text-sm font-semibold text-sgvu-navy">{exam.subject_name || exam.subject_code || 'Subject not specified'}</h3>
                          <p className="mt-1 flex items-start gap-2 break-words text-xs text-muted-foreground"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{exam.venue || 'Venue not assigned'}</span></p>
                        </div>
                      ))}
                      {timetable.data.length > 4 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                          <p className="text-xs text-muted-foreground">Showing {showAllExams ? timetable.data.length : 4} of {timetable.data.length} exams.</p>
                          <Button variant="outline" size="sm" aria-expanded={showAllExams} aria-controls="dashboard-timetable" onClick={() => setShowAllExams((current) => !current)}>
                            {showAllExams ? 'Show fewer exams' : `Show all ${timetable.data.length} exams`}
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
              {quickActions.map((action) => <Button key={action.href} asChild variant="outline" className="h-auto min-h-11 justify-between whitespace-normal py-3 text-left hover:border-sgvu-gold"><Link href={action.href}>{action.label}<ArrowRight aria-hidden="true" /></Link></Button>)}
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="activity-title" className="min-w-0 lg:col-span-2">
          <Card className="h-full">
            <CardHeader><CardTitle id="activity-title">Recent audit activity</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-3 overflow-y-auto pt-5" aria-busy={summary.loading}>
              {summary.loading ? <p role="status" className="text-sm text-muted-foreground">Loading activity…</p>
                : summary.error ? <p className="text-sm text-muted-foreground">Audit activity is unavailable. Retry the dashboard summary above.</p>
                  : !stats?.recent_activity?.length ? <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
                    : stats.recent_activity.map((row) => (
                      <div key={row.audit_id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 last:border-0">
                        <div className="min-w-0"><p className="break-words text-sm font-medium text-sgvu-navy">{readable(row.action)}</p><p className="mt-1 text-xs text-muted-foreground">{readable(row.resource_type)} · {row.actor_name ?? 'System'}</p></div>
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
