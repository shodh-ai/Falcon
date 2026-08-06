'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  ClipboardList,
  FileSpreadsheet,
  FileText,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { AddLeadDialog } from '@/components/admissions-crm/AddLeadDialog';
import { LeadPipelineSummaryCard } from '@/components/admissions-crm/LeadPipelineSummaryCard';
import {
  computeKpis,
  DEMO_ACTIVITIES,
  DEMO_ENROLLMENTS,
  DEMO_FEE_COLLECTION,
  DEMO_PENDING_WORK,
  DEMO_PROGRAM_BARS,
  DEMO_TREND,
  STAGE_LABELS,
  formatRelative,
  leadMeta,
  type CrmLead,
} from '@/components/admissions-crm/admissions-crm-dashboard-data';
import {
  ADMISSIONS_CRM_PIPELINE_HREF,
  BRAND_BTN,
} from '@/components/admissions-crm/admissions-crm-constants';
import { useAdmissionsKanban } from '@/components/admissions-crm/useAdmissionsKanban';
import { RegistrarKpiCard } from '@/components/admin/RegistrarKpiCard';
import { HrAvatar } from '@/components/hr/HrAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function buildLiveProgramBars(leads: CrmLead[]) {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const program = leadMeta(lead, 'program', leadMeta(lead, 'preferred_program', 'General'));
    counts.set(program, (counts.get(program) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value, max: 1 }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, max }));
}

function buildLiveStageBars(stageCounts: Record<string, number>) {
  const keys = Object.keys(STAGE_LABELS);
  const rows = keys
    .map((key) => ({
      label: STAGE_LABELS[key] ?? key,
      value: stageCounts[key] ?? 0,
      max: 1,
    }))
    .filter((r) => r.value > 0);
  const max = Math.max(1, ...rows.map((r) => r.value), 1);
  return (rows.length ? rows : [{ label: 'No data', value: 0, max: 1 }]).map((r) => ({
    ...r,
    max,
  }));
}

function buildLiveActivity(leads: CrmLead[]) {
  return [...leads]
    .sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
        new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
    )
    .slice(0, 5)
    .map((lead) => ({
      id: lead.lead_id,
      actor: lead.full_name,
      text: `is in ${STAGE_LABELS[lead.stage] ?? lead.stage}`,
      time: formatRelative(lead.updated_at ?? lead.created_at),
    }));
}

function HorizontalBars({
  title,
  data,
  suffix = '',
}: {
  title: string;
  data: { label: string; value: number; max: number }[];
  suffix?: string;
}) {
  return (
    <Card className="border-sgvu-navy/10 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-sgvu-navy">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-sgvu-navy">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {row.value.toLocaleString('en-IN')}
                {suffix}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold transition-all"
                style={{ width: `${Math.min(100, (row.value / row.max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdmissionsCrmDashboard() {
  const router = useRouter();
  const { allLeads, stageCounts, useDemo, loading, creatingLead, load, addLead } = useAdmissionsKanban();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const kpis = useMemo(() => computeKpis(allLeads, stageCounts, useDemo), [allLeads, stageCounts, useDemo]);
  const liveActivity = useMemo(
    () => (useDemo ? DEMO_ACTIVITIES : buildLiveActivity(allLeads)),
    [allLeads, useDemo],
  );
  const stageBars = useMemo(
    () => (useDemo ? DEMO_TREND : buildLiveStageBars(stageCounts)),
    [stageCounts, useDemo],
  );
  const programBars = useMemo(
    () => (useDemo ? DEMO_PROGRAM_BARS : buildLiveProgramBars(allLeads)),
    [allLeads, useDemo],
  );
  const enrollmentBars = useMemo(() => {
    if (useDemo) return DEMO_ENROLLMENTS;
    const enrolled = stageCounts.ENROLLED ?? 0;
    const feePaid = stageCounts.FEE_PAID ?? 0;
    return [
      { label: 'Fee paid', value: feePaid, max: Math.max(feePaid, enrolled, 1) },
      { label: 'Enrolled', value: enrolled, max: Math.max(feePaid, enrolled, 1) },
    ];
  }, [stageCounts, useDemo]);
  const feeBars = useMemo(() => {
    if (useDemo) return DEMO_FEE_COLLECTION;
    const feePaid = stageCounts.FEE_PAID ?? 0;
    const started = stageCounts.APPLICATION_STARTED ?? 0;
    return [
      { label: 'Applications', value: started, max: Math.max(started, feePaid, 1) },
      { label: 'Fee paid', value: feePaid, max: Math.max(started, feePaid, 1) },
    ];
  }, [stageCounts, useDemo]);

  const pendingWork = useMemo(() => {
    if (useDemo) return DEMO_PENDING_WORK;
    return DEMO_PENDING_WORK.map((item) => ({
      ...item,
      count:
        item.id === 'docs'
          ? kpis.documentsPending
          : item.id === 'fees'
            ? Math.max(0, kpis.applicationsStarted - kpis.feePaid)
            : item.id === 'approve'
              ? kpis.enrolled
              : item.count,
    }));
  }, [useDemo, kpis]);

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-6 px-4 py-6 md:px-8" data-testid="admissions-crm-dashboard">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.14),transparent_55%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">Falcon Workspace</p>
              <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">Admissions CRM</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Executive overview of enrollment intake — KPIs, pending work, pipeline summary, and analytics.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  'inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60',
                  BRAND_BTN,
                )}
                disabled={creatingLead || loading}
                onClick={() => setAddLeadOpen(true)}
              >
                {creatingLead ? 'Adding…' : 'Add Lead'}
              </button>
              <Link
                href="/admin/students/bulk-upload"
                className={cn('inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold', BRAND_BTN)}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Import Excel
              </Link>
              <Button type="button" size="sm" className={cn('h-10', BRAND_BTN)} onClick={load} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {useDemo ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-900">
          Showing demo analytics — add leads or import data to populate live metrics.
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RegistrarKpiCard title="Total Leads" value={kpis.totalLeads} trendLabel="+18 this week" icon={Users} accent="blue" loading={loading} />
        <RegistrarKpiCard title="New Leads Today" value={kpis.newToday} trendLabel="Since midnight" trendPositive icon={UserPlus} accent="indigo" loading={loading} />
        <RegistrarKpiCard title="Applications Started" value={kpis.applicationsStarted} trendLabel="In progress" icon={ClipboardList} accent="purple" loading={loading} />
        <RegistrarKpiCard title="Documents Pending" value={kpis.documentsPending} trendLabel="Needs review" trendPositive={kpis.documentsPending < 20} icon={FileText} accent="amber" loading={loading} href="/admissions-crm/verifications" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-sgvu-navy/10 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-sgvu-navy">Pending Admissions Work</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {pendingWork.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-sgvu-navy/10 px-4 py-3 transition hover:border-sgvu-gold/40 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-sgvu-navy">{item.label}</span>
                <span
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-mono text-sm font-black tabular-nums',
                    item.tone === 'amber' && 'bg-amber-50 text-amber-700',
                    item.tone === 'orange' && 'bg-orange-50 text-orange-700',
                    item.tone === 'blue' && 'bg-blue-50 text-blue-700',
                    item.tone === 'purple' && 'bg-purple-50 text-purple-700',
                    item.tone === 'green' && 'bg-emerald-50 text-emerald-700',
                  )}
                >
                  {item.count}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-sgvu-navy/10 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-sgvu-navy">
              <Zap className="h-4 w-4 text-sgvu-gold" aria-hidden />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              { label: 'Add Lead', onClick: () => setAddLeadOpen(true) },
              { label: 'Import Excel', href: '/admin/students/bulk-upload' },
              { label: 'View Pipeline', href: ADMISSIONS_CRM_PIPELINE_HREF },
              { label: 'Verify Documents', href: '/admissions-crm/verifications' },
              { label: 'Generate Offer Letter', href: '/admissions-crm/enrolled-students' },
              { label: 'Counselling', href: '/admissions-crm/counseling' },
            ].map((action) =>
              'href' in action && action.href ? (
                <Link key={action.label} href={action.href} className={cn('inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold', BRAND_BTN)}>
                  {action.label}
                </Link>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  className={cn('inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold', BRAND_BTN)}
                  disabled={action.label === 'Add Lead' && (creatingLead || loading)}
                  onClick={'onClick' in action ? action.onClick : undefined}
                >
                  {action.label === 'Add Lead' && creatingLead ? 'Adding…' : action.label}
                </button>
              ),
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-sgvu-navy/10 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-sgvu-navy">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {liveActivity.map((item) => (
              <div key={item.id} className="flex gap-3 border-b border-sgvu-navy/5 pb-3 last:border-0 last:pb-0">
                <HrAvatar name={item.actor} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm text-sgvu-navy">
                    <span className="font-semibold">{item.actor}</span> {item.text}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <LeadPipelineSummaryCard stageCounts={stageCounts} useDemo={useDemo} loading={loading} />
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HorizontalBars title={useDemo ? 'Admissions Trend' : 'Pipeline by stage'} data={stageBars} />
        <HorizontalBars title={useDemo ? 'Monthly Enrollments' : 'Enrollment progress'} data={enrollmentBars} />
        <HorizontalBars
          title={useDemo ? 'Fee Collection (₹ L)' : 'Fee conversion'}
          data={feeBars}
          suffix={useDemo ? ' L' : ''}
        />
        <HorizontalBars title="Program-wise Admissions" data={programBars} />
      </section>

      <AddLeadDialog
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        submitting={creatingLead}
        onSubmit={async (values) => {
          const created = await addLead('CRM Dashboard', values);
          if (created?.lead_id) {
            setAddLeadOpen(false);
            router.push(ADMISSIONS_CRM_PIPELINE_HREF);
          }
        }}
      />
    </div>
  );
}
