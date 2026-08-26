'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileUp,
  GraduationCap,
  History,
  Kanban,
  Loader2,
  Shield,
  Users,
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

type BulkHistoryRow = { rows_imported: number; status?: string; created_at?: string };

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

const QUICK_ACTIONS = [
  {
    href: '/admin/verifications',
    label: 'Verifications',
    description: 'Clear onboarding queue',
    icon: FileCheck2,
  },
  {
    href: '/admin/tasks',
    label: 'Governance',
    description: 'Approvals & tickets',
    icon: ClipboardList,
  },
  {
    href: '/admin/admissions',
    label: 'Admissions CRM',
    description: 'Today’s intake pipeline',
    icon: Kanban,
  },
  {
    href: '/admin/students/bulk-upload',
    label: 'Excel Upload',
    description: 'Bulk student import',
    icon: FileUp,
  },
  {
    href: '/directory',
    label: 'Directory',
    description: 'Students & faculty',
    icon: Users,
  },
  {
    href: '/admin/iam',
    label: 'IAM',
    description: 'Roles & hierarchy',
    icon: Shield,
  },
] as const;

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

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

export default function AdminDashboardPage() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [pendingVerifications, setPendingVerifications] = useState<VerificationRow[]>([]);
  const [recentBulkImports, setRecentBulkImports] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<RegistrarKpiSnapshot | null>(null);
  const [workflowStudents, setWorkflowStudents] = useState<WorkflowStudent[]>([]);
  const [workflowStudentId, setWorkflowStudentId] = useState<string>('');
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<
    Array<{ kind: string; id: string; title: string; actor_name?: string; occurred_at?: string }>
  >([]);

  const onSnapshot = useCallback((snapshot: RegistrarKpiSnapshot) => {
    setKpi(snapshot);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [queue, bulkHistory, placement, reports, activity] = await Promise.all([
        api.get<VerificationRow[]>('/api/admin/student-verifications/queue').catch(() => []),
        api.get<BulkHistoryRow[]>('/admissions/students/bulk-upload/history').catch(() => []),
        api
          .get<{ rows: WorkflowStudent[] }>(`${REGISTRAR_DESK.placementStudents}?limit=50&offset=0`)
          .catch(() => ({ rows: [] })),
        api.get<ReportSummary>(REGISTRAR_DESK.reportsSummary).catch(() => null),
        api
          .get<
            Array<{ kind: string; id: string; title: string; actor_name?: string; occurred_at?: string }>
          >(`${REGISTRAR_DESK.activity}?limit=8`)
          .catch(() => []),
      ]);
      const queueRows = Array.isArray(queue) ? queue : [];
      setPendingVerifications(queueRows.slice(0, 5));
      const bulkRows = Array.isArray(bulkHistory) ? bulkHistory : [];
      setRecentBulkImports(
        bulkRows.slice(0, 5).reduce((sum, row) => sum + Number(row.rows_imported ?? 0), 0),
      );
      const students = Array.isArray(placement?.rows) ? placement.rows : [];
      setWorkflowStudents(students);
      setWorkflowStudentId((prev) => prev || students[0]?.user_id || '');
      setReportSummary(reports);
      setRecentActivity(Array.isArray(activity) ? activity : []);
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
    const items: Array<{ label: string; value: number; href: string; tone: 'amber' | 'orange' | 'purple' | 'green' }> =
      [];
    if (kpi) {
      if (kpi.pendingApprovals > 0) {
        items.push({
          label: 'Governance approvals',
          value: kpi.pendingApprovals,
          href: '/admin/tasks',
          tone: 'amber',
        });
      }
      if (kpi.verificationRequests > 0) {
        items.push({
          label: 'Verification queue',
          value: kpi.verificationRequests,
          href: '/admin/verifications',
          tone: 'orange',
        });
      }
      if (kpi.documentsPending > 0) {
        items.push({
          label: 'Documents to review',
          value: kpi.documentsPending,
          href: '/admin/upload-history',
          tone: 'purple',
        });
      }
      if (items.length === 0) {
        items.push({
          label: 'Queues clear',
          value: 0,
          href: '/admin/tasks',
          tone: 'green',
        });
      }
    }
    return items;
  }, [kpi]);

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
    <div className="mx-auto max-w-6xl space-y-6" data-testid="registrar-dashboard">
      {/* Hero */}
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.14),transparent_55%)]" />
          <div className="relative flex flex-col gap-5">
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
                Falcon Workspace · Management
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
                Registrar Command Center
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {todayLabel}. Monitor campus headcount, clear governance queues, and keep admissions
                intake moving.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <RegistrarKpiSection onSnapshot={onSnapshot} />

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
            Student lifecycle
          </p>
          <h3 className="mt-1 text-lg font-bold text-sgvu-navy sm:text-xl">
            Registrar workflow
          </h3>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Select a student to track live progress from admission through graduation.
          </p>
          <div className="mb-4 max-w-md">
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
          </div>
          <RegistrarWorkflowStepper studentUserId={workflowStudentId || undefined} />
        </CardContent>
      </Card>

      {reportSummary?.status_breakdown?.length ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-sgvu-navy">Lifecycle distribution</CardTitle>
            <CardDescription>
              Active {reportSummary.enrollment_active ?? 0} · Alumni{' '}
              {reportSummary.graduated_alumni ?? 0} · Pending regs{' '}
              {reportSummary.pending_registrations ?? 0}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-5">
            {reportSummary.status_breakdown.slice(0, 8).map((row) => {
              const max = Math.max(
                ...reportSummary.status_breakdown!.map((r) => Number(r.count) || 0),
                1,
              );
              const pct = Math.round(((Number(row.count) || 0) / max) * 100);
              return (
                <div key={row.status} className="grid grid-cols-[120px_1fr_40px] items-center gap-2 text-sm">
                  <span className="truncate text-muted-foreground">
                    {String(row.status).replace(/_/g, ' ')}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#0B2447]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-sgvu-navy">{row.count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {recentActivity.length ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-sgvu-navy">Registrar activity</CardTitle>
            <CardDescription>Latest certificates, petitions, and signing events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-5">
            {recentActivity.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-sgvu-navy/5 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-sgvu-navy">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind}
                    {item.actor_name ? ` · ${item.actor_name}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.occurred_at ? new Date(item.occurred_at).toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <GovernanceTasksSummaryCard />

      {/* Quick actions */}
      <section className="space-y-3" aria-label="Quick actions">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-5 md:p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Shortcuts
            </p>
            <h3 className="mt-1 text-lg font-bold text-sgvu-navy sm:text-xl">
              Jump to high-traffic workspaces
            </h3>
          </CardContent>
        </Card>
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

      {loadError ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </p>
      ) : null}

      {/* Priority + attention */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="border-sgvu-navy/10 bg-white shadow-sm lg:col-span-3">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-sgvu-gold" />
                Priority verification queue
              </CardTitle>
              <CardDescription>Newest pending onboarding approvals</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="border-sgvu-navy/15">
              <Link href="/admin/verifications">Open full queue</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading queue…
              </p>
            ) : pendingVerifications.length === 0 ? (
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
            ) : (
              pendingVerifications.map((item) => (
                <div
                  key={item.user_id}
                  className="flex flex-col gap-3 rounded-xl border border-sgvu-navy/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-sgvu-navy/15">
                        {item.portal_kind} · {item.role_name}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatWhen(item.submitted_at)}
                      </span>
                    </div>
                    <p className="truncate font-semibold text-sgvu-navy">{item.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.official_email}</p>
                  </div>
                  <Button asChild size="sm" className={cn('shrink-0', BRAND_BTN)}>
                    <Link href="/admin/verifications">Review</Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 bg-white shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Attention required</CardTitle>
            <CardDescription>Actionable counts from live campus queues</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-sgvu-navy/10 px-3.5 py-3 transition hover:border-sgvu-gold/40 hover:bg-sgvu-surface/70"
              >
                <div>
                  <p className="text-sm font-semibold text-sgvu-navy">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">Open workspace</p>
                </div>
                <span
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-mono text-sm font-black tabular-nums',
                    item.tone === 'amber' && 'bg-amber-50 text-amber-700',
                    item.tone === 'orange' && 'bg-orange-50 text-orange-700',
                    item.tone === 'purple' && 'bg-purple-50 text-purple-700',
                    item.tone === 'green' && 'bg-emerald-50 text-emerald-700',
                  )}
                >
                  {item.value}
                </span>
              </Link>
            ))}

            {!loading && recentBulkImports != null && recentBulkImports > 0 ? (
              <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/50 px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy">
                  <History className="h-4 w-4 text-sgvu-gold" />
                  Recent bulk intake
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {recentBulkImports.toLocaleString('en-IN')} students imported across the last five
                  upload runs.
                </p>
                <Link
                  href="/admin/upload-history"
                  className="mt-2 inline-flex items-center text-xs font-semibold text-sgvu-navy underline-offset-2 hover:underline"
                >
                  View upload history
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-sgvu-navy/15 px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy">
                  <GraduationCap className="h-4 w-4 text-sgvu-gold" />
                  Intake tip
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use Student Excel Upload for batch enrollment, then confirm rows in Upload History.
                </p>
                <Link
                  href="/admin/students/bulk-upload"
                  className="mt-2 inline-flex items-center text-xs font-semibold text-sgvu-navy underline-offset-2 hover:underline"
                >
                  Start bulk upload
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ProfileCorrectionWidget limit={10} reviewHref="/admin/profile-corrections" />
    </div>
  );
}
