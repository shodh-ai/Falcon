'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  Loader2,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';
import {
  RegistrarKpiSection,
  type RegistrarKpiSnapshot,
} from '@/components/admin/RegistrarKpiSection';
import { RegistrarWorkflowStepper } from '@/components/admin/registrar-desk/RegistrarWorkflowStepper';
import { GovernanceTasksSummaryCard } from '@/components/admin/GovernanceTasksPanel';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type VerificationRow = {
  user_id: string;
  name: string;
  official_email: string;
  role_name: string;
  portal_kind: string;
  submitted_at: string | null;
};

type WorkflowStudent = {
  user_id: string;
  name: string;
  enrollment_no?: string;
};

type ReportSummary = {
  enrollment_active?: number;
  graduated_alumni?: number;
  pending_registrations?: number;
  status_breakdown?: Array<{ status: string; count: number }>;
};

type ActivityItem = {
  kind: string;
  id: string;
  title: string;
  actor_name?: string;
  occurred_at?: string;
};

type DeskTab = 'focus' | 'lifecycle' | 'activity';

const QUICK_ACTIONS = [
  {
    href: '/admin/enrollment',
    label: 'Enrollment',
    description: 'Fee-paid → PRN',
    icon: UserPlus,
  },
  {
    href: '/admin/verifications',
    label: 'Verifications',
    description: 'Onboarding queue',
    icon: FileCheck2,
  },
  {
    href: '/admin/semester-registrations',
    label: 'Registrations',
    description: 'Semester approvals',
    icon: ClipboardList,
  },
  {
    href: '/admin/certificates',
    label: 'Certificates',
    description: 'Issue & sign',
    icon: FileText,
  },
  {
    href: '/admin/degree-eligibility',
    label: 'Degrees',
    description: 'Eligibility decisions',
    icon: GraduationCap,
  },
  {
    href: '/admin/tasks',
    label: 'Governance',
    description: 'Approvals & tickets',
    icon: ClipboardList,
  },
] as const;

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

const ACTIVITY_HREF: Record<string, string> = {
  certificate: '/admin/certificates',
  petition: '/admin/academic-petitions',
  registration: '/admin/semester-registrations',
  governance: '/admin/tasks',
  enrollment: '/admin/enrollment',
  degree: '/admin/degree-eligibility',
  document: '/admin/academic-petitions',
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recently';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeWhen(iso: string | null | undefined): string {
  if (!iso) return 'Just now';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Just now';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function activityHref(kind: string): string {
  const key = String(kind || '')
    .trim()
    .toLowerCase();
  for (const [token, href] of Object.entries(ACTIVITY_HREF)) {
    if (key.includes(token)) return href;
  }
  return '/admin/registrar-reports';
}

function kindBadge(kind: string): string {
  return String(kind || 'update')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminDashboardPage() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [pendingVerifications, setPendingVerifications] = useState<VerificationRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<RegistrarKpiSnapshot | null>(null);
  const [workflowStudents, setWorkflowStudents] = useState<WorkflowStudent[]>([]);
  const [workflowStudentId, setWorkflowStudentId] = useState<string>('');
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [tab, setTab] = useState<DeskTab>('focus');

  const onSnapshot = useCallback((snapshot: RegistrarKpiSnapshot) => {
    setKpi(snapshot);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.allSettled([
        api.get<VerificationRow[]>('/api/admin/student-verifications/queue'),
        api.get<{ rows: WorkflowStudent[] }>(`${REGISTRAR_DESK.placementStudents}?limit=50&offset=0`),
        api.get<ReportSummary>(REGISTRAR_DESK.reportsSummary),
        api.get<ActivityItem[]>(`${REGISTRAR_DESK.activity}?limit=8`),
      ]);

      const queue =
        results[0].status === 'fulfilled' && Array.isArray(results[0].value)
          ? results[0].value
          : [];
      const placement =
        results[1].status === 'fulfilled' ? results[1].value : { rows: [] as WorkflowStudent[] };
      const reports = results[2].status === 'fulfilled' ? results[2].value : null;
      const activity =
        results[3].status === 'fulfilled' && Array.isArray(results[3].value)
          ? results[3].value
          : [];

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === results.length) {
        setLoadError('Failed to load dashboard data. Try refreshing.');
      } else if (failed > 0) {
        setLoadError('Some dashboard panels could not load. Showing available live data.');
      }

      setPendingVerifications(queue.slice(0, 5));
      const students = Array.isArray(placement?.rows) ? placement.rows : [];
      setWorkflowStudents(students);
      setWorkflowStudentId((prev) => prev || students[0]?.user_id || '');
      setReportSummary(reports);
      setRecentActivity(activity);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const attentionItems = useMemo(() => {
    const items: Array<{
      label: string;
      value: number;
      href: string;
      tone: 'amber' | 'orange' | 'purple' | 'green' | 'blue';
      hint: string;
    }> = [];
    if (kpi) {
      if (kpi.pendingEnrollments > 0) {
        items.push({
          label: 'Awaiting enrollment',
          value: kpi.pendingEnrollments,
          href: '/admin/enrollment',
          tone: 'green',
          hint: 'Fee-verified leads without PRN',
        });
      }
      if (kpi.verificationRequests > 0) {
        items.push({
          label: 'Verification queue',
          value: kpi.verificationRequests,
          href: '/admin/verifications',
          tone: 'orange',
          hint: 'Student / staff onboarding',
        });
      }
      if (kpi.pendingRegistrations > 0) {
        items.push({
          label: 'Semester registrations',
          value: kpi.pendingRegistrations,
          href: '/admin/semester-registrations',
          tone: 'amber',
          hint: 'Submitted / pending / sent back',
        });
      }
      if (kpi.pendingCertificates > 0) {
        items.push({
          label: 'Certificate requests',
          value: kpi.pendingCertificates,
          href: '/admin/certificates',
          tone: 'blue',
          hint: 'Draft or generated certificates',
        });
      }
      if (kpi.pendingDegreeEligibility > 0) {
        items.push({
          label: 'Degree eligibility',
          value: kpi.pendingDegreeEligibility,
          href: '/admin/degree-eligibility',
          tone: 'purple',
          hint: 'Eligible — awaiting Registrar decision',
        });
      }
      if (kpi.pendingGovernance > 0) {
        items.push({
          label: 'Governance tasks',
          value: kpi.pendingGovernance,
          href: '/admin/tasks',
          tone: 'amber',
          hint: 'University governance approvals',
        });
      }
      if (kpi.pendingPetitions > 0) {
        items.push({
          label: 'Academic petitions',
          value: kpi.pendingPetitions,
          href: '/admin/academic-petitions',
          tone: 'purple',
          hint: 'Pending petition decisions',
        });
      }
    }
    if (pendingVerifications.length > 0 && !items.some((i) => i.href === '/admin/verifications')) {
      items.push({
        label: 'Verification queue',
        value: pendingVerifications.length,
        href: '/admin/verifications',
        tone: 'orange',
        hint: 'Waiting for review',
      });
    }
    return items;
  }, [kpi, pendingVerifications.length]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8" data-testid="registrar-dashboard">
      {/* Hero — one clear job */}
      <header className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm">
        <div className="relative px-5 py-5 md:px-6 md:py-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.16),transparent_55%)]" />
          <div className="relative min-w-0 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Falcon Workspace · Management
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
              Registrar Command Center
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {todayLabel}. Live campus KPIs and desk queues first — then clear priority actions and
              work queues below.
            </p>
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-destructive/30"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      ) : null}

      {/* KPIs — campus snapshot */}
      <RegistrarKpiSection onSnapshot={onSnapshot} />

      {/* Compact shortcuts */}
      <section aria-label="Shortcuts" className="space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
            Shortcuts
          </p>
          <h2 className="text-base font-bold text-sgvu-navy sm:text-lg">
            Jump to high-traffic workspaces
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-col rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:shadow-md"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy transition group-hover:bg-sgvu-gold/15 group-hover:text-sgvu-gold">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-bold text-sgvu-navy">{action.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {action.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <ProfileCorrectionWidget limit={10} reviewHref="/admin/profile-corrections" />

      {/* Priority actions + work queues — bottom of dashboard */}
      <section aria-label="What needs attention" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
              Do this next
            </p>
            <h2 className="text-base font-bold text-sgvu-navy sm:text-lg">Priority actions</h2>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-sgvu-navy">
            <Link href="/admin/tasks">
              All governance
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {attentionItems.length === 0 && !loading ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-sgvu-navy">Nothing urgent in the desk queues</p>
                <p className="text-sm text-muted-foreground">
                  Enrollment, verifications, registrations, certificates, and governance are clear.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className={cn('shrink-0', BRAND_BTN)}>
              <Link href="/admin/enrollment">Open enrollment</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'group flex items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm transition',
                  'hover:-translate-y-0.5 hover:border-sgvu-gold/45 hover:shadow-md',
                  item.tone === 'amber' && 'border-amber-200/80',
                  item.tone === 'orange' && 'border-orange-200/80',
                  item.tone === 'purple' && 'border-purple-200/80',
                  item.tone === 'green' && 'border-emerald-200/80',
                  item.tone === 'blue' && 'border-blue-200/80',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-sgvu-navy">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>
                  <p className="mt-2 inline-flex items-center text-xs font-semibold text-sgvu-navy opacity-80 group-hover:opacity-100">
                    Open workspace
                    <ArrowRight className="ml-1 h-3 w-3 transition group-hover:translate-x-0.5" />
                  </p>
                </div>
                <span
                  className={cn(
                    'flex h-12 min-w-12 items-center justify-center rounded-xl px-2 font-mono text-xl font-black tabular-nums',
                    item.tone === 'amber' && 'bg-amber-50 text-amber-700',
                    item.tone === 'orange' && 'bg-orange-50 text-orange-700',
                    item.tone === 'purple' && 'bg-purple-50 text-purple-700',
                    item.tone === 'green' && 'bg-emerald-50 text-emerald-700',
                    item.tone === 'blue' && 'bg-blue-50 text-blue-700',
                  )}
                >
                  {item.value}
                </span>
              </Link>
            ))}
            {loading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={`skel-${i}`}
                    className="h-[88px] animate-pulse rounded-2xl border border-sgvu-navy/10 bg-slate-100/80"
                  />
                ))
              : null}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-sgvu-navy/10 bg-sgvu-surface/40 p-2">
          {(
            [
              { id: 'focus' as const, label: 'Work queues', icon: Sparkles },
              { id: 'lifecycle' as const, label: 'Student lifecycle', icon: GraduationCap },
              { id: 'activity' as const, label: 'Recent activity', icon: History },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition',
                  active
                    ? 'bg-[#0B2447] text-white shadow-sm'
                    : 'text-sgvu-navy/70 hover:bg-white hover:text-sgvu-navy',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 md:p-5">
          {tab === 'focus' ? (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="border-sgvu-navy/10 shadow-none lg:col-span-3">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileCheck2 className="h-4 w-4 text-sgvu-gold" />
                      Verification queue
                    </CardTitle>
                    <CardDescription>Newest pending onboarding approvals</CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm" className="border-sgvu-navy/15">
                    <Link href="/admin/verifications">Full queue</Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading queue…
                    </p>
                  ) : pendingVerifications.length === 0 ? (
                    <EmptyQueue />
                  ) : (
                    pendingVerifications.map((item) => (
                      <div
                        key={item.user_id}
                        className="flex flex-col gap-3 rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-sgvu-navy/15">
                              {item.portal_kind} · {item.role_name}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {relativeWhen(item.submitted_at)} · {formatWhen(item.submitted_at)}
                            </span>
                          </div>
                          <p className="truncate font-semibold text-sgvu-navy">{item.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {item.official_email}
                          </p>
                        </div>
                        <Button asChild size="sm" className={cn('shrink-0', BRAND_BTN)}>
                          <Link href="/admin/verifications">Review</Link>
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4 lg:col-span-2">
                <GovernanceTasksSummaryCard />
                <Card className="border-sgvu-navy/10 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Quick tip</CardTitle>
                    <CardDescription>Keep intake and corrections moving</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-5">
                    {!loading && kpi && kpi.pendingEnrollments > 0 ? (
                      <TipBlock
                        icon={<UserPlus className="h-4 w-4 text-sgvu-gold" />}
                        title="Enrollment waiting"
                        body={`${kpi.pendingEnrollments.toLocaleString('en-IN')} fee-verified lead(s) still need a PRN / enrollment number.`}
                        href="/admin/enrollment"
                        cta="Open enrollment desk"
                      />
                    ) : (
                      <TipBlock
                        icon={<GraduationCap className="h-4 w-4 text-sgvu-gold" />}
                        title="Student lifecycle"
                        body="Track status changes from enrolled through alumni on the lifecycle desk."
                        href="/admin/student-lifecycle"
                        cta="Open lifecycle desk"
                      />
                    )}
                    <TipBlock
                      icon={<FileText className="h-4 w-4 text-sgvu-gold" />}
                      title="Profile corrections"
                      body="Approve spelling and master-data fixes from the corrections queue above."
                      href="/admin/profile-corrections"
                      cta="Open corrections"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {tab === 'lifecycle' ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                  Track one student
                </p>
                <h3 className="mt-1 text-lg font-bold text-sgvu-navy">Registrar workflow</h3>
                <p className="mt-1 mb-4 max-w-2xl text-sm text-muted-foreground">
                  Pick a student to see live progress from admission through graduation. Click a
                  completed or pending stage in related desk modules when you need to act.
                </p>
                <div className="mb-4 max-w-md">
                  {workflowStudents.length === 0 && !loading ? (
                    <p className="rounded-xl border border-dashed border-sgvu-navy/15 px-4 py-3 text-sm text-muted-foreground">
                      No students in the placement roster yet.{' '}
                      <Link href="/admin/enrollment" className="font-semibold text-sgvu-navy underline-offset-2 hover:underline">
                        Enroll a student
                      </Link>{' '}
                      to track lifecycle here.
                    </p>
                  ) : (
                    <Select
                      value={workflowStudentId || undefined}
                      onValueChange={setWorkflowStudentId}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select student for workflow" />
                      </SelectTrigger>
                      <SelectContent>
                        {workflowStudents.map((s) => (
                          <SelectItem key={s.user_id} value={s.user_id}>
                            {s.name}
                            {s.enrollment_no ? ` (${s.enrollment_no})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {workflowStudentId ? (
                  <RegistrarWorkflowStepper studentUserId={workflowStudentId} />
                ) : null}
              </div>

              {reportSummary?.status_breakdown?.length ? (
                <div className="rounded-2xl border border-sgvu-navy/10 bg-sgvu-surface/40 p-4 md:p-5">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold text-sgvu-navy">Lifecycle distribution</h4>
                      <p className="text-sm text-muted-foreground">
                        Active {reportSummary.enrollment_active ?? 0} · Alumni{' '}
                        {reportSummary.graduated_alumni ?? 0} · Pending regs{' '}
                        {reportSummary.pending_registrations ?? 0}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="border-sgvu-navy/15">
                      <Link href="/admin/student-lifecycle">Open lifecycle desk</Link>
                    </Button>
                  </div>
                  <div className="space-y-2.5">
                    {reportSummary.status_breakdown.slice(0, 8).map((row) => {
                      const max = Math.max(
                        ...reportSummary.status_breakdown!.map((r) => Number(r.count) || 0),
                        1,
                      );
                      const pct = Math.round(((Number(row.count) || 0) / max) * 100);
                      return (
                        <div
                          key={row.status}
                          className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-2 text-sm"
                        >
                          <span className="truncate capitalize text-muted-foreground">
                            {String(row.status).replace(/_/g, ' ').toLowerCase()}
                          </span>
                          <div className="h-2.5 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-[#0B2447] transition-[width] duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-right tabular-nums font-semibold text-sgvu-navy">
                            {row.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-sgvu-navy/15 px-4 py-8 text-center text-sm text-muted-foreground">
                  Lifecycle totals will appear when report summary data is available.
                </p>
              )}
            </div>
          ) : null}

          {tab === 'activity' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-sgvu-navy">Registrar activity</h3>
                  <p className="text-sm text-muted-foreground">
                    Certificates, petitions, and signing events — click a row to open the matching desk.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="border-sgvu-navy/15">
                  <Link href="/admin/registrar-reports">Reports</Link>
                </Button>
              </div>
              {recentActivity.length ? (
                <ul className="divide-y divide-sgvu-navy/8 overflow-hidden rounded-2xl border border-sgvu-navy/10">
                  {recentActivity.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link
                        href={activityHref(item.kind)}
                        className="flex items-start justify-between gap-3 px-4 py-3.5 transition hover:bg-sgvu-surface/60"
                      >
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="font-medium">
                              {kindBadge(item.kind)}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {relativeWhen(item.occurred_at)}
                            </span>
                          </div>
                          <p className="truncate font-semibold text-sgvu-navy">{item.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.actor_name ? `By ${item.actor_name}` : 'System event'}
                            {item.occurred_at ? ` · ${formatWhen(item.occurred_at)}` : ''}
                          </p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-sgvu-navy/40" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : loading ? (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading activity…
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-sgvu-navy/15 px-4 py-10 text-center text-sm text-muted-foreground">
                  No recent desk activity yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-sgvu-navy/15 bg-sgvu-surface/60 px-6 py-10 text-center">
      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      <p className="mt-3 text-sm font-semibold text-sgvu-navy">Queue is clear</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        No student or staff verifications are waiting. New submissions will appear here
        automatically.
      </p>
      <Button asChild size="sm" className={cn('mt-4', BRAND_BTN)}>
        <Link href="/admin/verifications">View verification history</Link>
      </Button>
    </div>
  );
}

function TipBlock({
  icon,
  title,
  body,
  href,
  cta,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/50 px-3.5 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="mt-2 inline-flex items-center text-xs font-semibold text-sgvu-navy underline-offset-2 hover:underline"
      >
        {cta}
        <ArrowRight className="ml-1 h-3 w-3" />
      </Link>
    </div>
  );
}
