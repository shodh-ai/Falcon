'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  IndianRupee,
  UserCheck,
  Users,
} from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { ExecutiveCard } from '@/components/leadership/executive/ExecutiveCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  EXECUTIVE_APPROVALS,
  FACULTY_SHORTAGE_DATA,
  HR_KPI,
  PAYROLL_BURN_TREND,
  formatFacultyRatio,
  formatInrCompact,
} from './hrMockData';
import { PresidentKpiCard } from './PresidentKpiCard';
import type { ExecutiveApprovalRow, HrKpi } from './types';

const FacultyShortageBarChart = dynamic(
  () => import('./PresidentCharts').then((m) => m.FacultyShortageBarChart),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100" /> },
);

const PayrollBurnAreaChart = dynamic(
  () => import('./PresidentCharts').then((m) => m.PayrollBurnAreaChart),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100" /> },
);

type ApiHrAnalytics = {
  faculty_retention_rate?: number;
  faculty_to_student_ratio?: number;
  total_payroll_expense?: number;
  payroll_trend?: Array<{ month: string; total: number }>;
};

type ApiApproval = {
  id?: string;
  candidate?: string;
  department?: string;
  action?: string;
  amount?: number;
  date_submitted?: string;
  status?: string;
};

/** Rows sourced from the live approvals API carry the backend request id. */
type ApprovalRow = ExecutiveApprovalRow & { requestId?: string };

type ApiHrApprovals = {
  pending_hires?: number;
  tenure_reviews?: number;
  disciplinary_cases?: number;
  approvals?: ApiApproval[];
};

const DEFAULT_CTC_BY_ACTION: Record<string, number> = {
  'New Hire': 18_00_000,
  Tenure: 21_00_000,
  Suspension: 9_00_000,
  Contract: 24_00_000,
};

function estimateCtc(action: string): number {
  const key = Object.keys(DEFAULT_CTC_BY_ACTION).find((k) =>
    action.toLowerCase().includes(k.toLowerCase()),
  );
  return key ? DEFAULT_CTC_BY_ACTION[key] : 15_00_000;
}

function mapApiApproval(row: ApiApproval, index: number): ApprovalRow {
  const name = row.candidate ?? 'Unknown';
  const actionType = row.action ?? 'Pending Review';
  const mockMatch = EXECUTIVE_APPROVALS.find(
    (m) => m.name === name || m.department === row.department,
  );

  return {
    id: row.id ?? `api-${index}-${name}`,
    requestId: row.id,
    name,
    department: row.department ?? '—',
    actionType,
    ctcInr:
      Number(row.amount ?? 0) > 0
        ? Number(row.amount)
        : mockMatch?.ctcInr ?? estimateCtc(actionType),
  };
}

function deriveKpis(analytics: ApiHrAnalytics | null, approvals: ApiHrApprovals | null): HrKpi {
  const pendingFromApi =
    (approvals?.pending_hires ?? 0) +
    (approvals?.tenure_reviews ?? 0) +
    (approvals?.disciplinary_cases ?? 0);

  return {
    monthlyPayroll: {
      amount: analytics?.total_payroll_expense ?? HR_KPI.monthlyPayroll.amount,
      momTrend: HR_KPI.monthlyPayroll.momTrend,
    },
    facultyStudentRatio: {
      studentsPerFaculty:
        analytics?.faculty_to_student_ratio ?? HR_KPI.facultyStudentRatio.studentsPerFaculty,
    },
    retentionRate: analytics?.faculty_retention_rate ?? HR_KPI.retentionRate,
    pendingActions: pendingFromApi > 0 ? pendingFromApi : HR_KPI.pendingActions,
  };
}

export function HrExecutiveDashboard({ focusInbox = false }: { focusInbox?: boolean }) {
  const api = useAuthedApi();
  const inboxRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<HrKpi>(HR_KPI);
  const [approvals, setApprovals] = useState<ApprovalRow[]>(EXECUTIVE_APPROVALS);
  const [payrollTrend, setPayrollTrend] = useState(PAYROLL_BURN_TREND);
  const [dossierRow, setDossierRow] = useState<ApprovalRow | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      let analytics: ApiHrAnalytics | null = null;
      let approvalPayload: ApiHrApprovals | null = null;

      try {
        analytics = await api.get<ApiHrAnalytics>('/api/president/hr-analytics');
      } catch {
        /* fall back to mock KPIs */
      }

      try {
        approvalPayload = await api.get<ApiHrApprovals>('/api/president/hr-approvals');
      } catch {
        /* fall back to mock approvals */
      }

      setKpis(deriveKpis(analytics, approvalPayload));

      const liveTrend = analytics?.payroll_trend ?? [];
      if (liveTrend.length > 1) {
        setPayrollTrend(
          liveTrend.map((point) => ({
            month: point.month,
            payrollCr: Number((point.total / 1e7).toFixed(2)),
          })),
        );
      }

      const apiRows = approvalPayload?.approvals ?? [];
      if (apiRows.length > 0) {
        setApprovals(apiRows.map(mapApiApproval));
      } else {
        setApprovals(EXECUTIVE_APPROVALS);
      }

      setLoading(false);
    })();
  }, [api]);

  useEffect(() => {
    if (!focusInbox || loading) return;
    const timer = window.setTimeout(() => {
      inboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [focusInbox, loading]);

  const reviewRow = async (row: ApprovalRow, approve: boolean) => {
    const verb = approve ? 'approved' : 'placed on hold';

    if (!row.requestId) {
      // Sample row — no backend record to update; keep the inbox interactive.
      setApprovals((prev) => prev.filter((r) => r.id !== row.id));
      toast.info(`Demo case — ${row.name} ${verb} in this session only.`);
      return;
    }

    setBusyRowId(row.id);
    try {
      await api.post(`/api/president/hr-approvals/${row.requestId}/review`, { approve });
      setApprovals((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`${row.name} ${verb} — decision recorded.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Could not record the decision for ${row.name}`,
      );
    } finally {
      setBusyRowId(null);
    }
  };

  if (loading) return <FalconLoader label="Loading HR Command Center…" />;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title="HR & Executive Appointments"
        description="Strategic workforce metrics, payroll exposure, faculty capacity gaps, and high-level appointment ratifications awaiting presidential sign-off."
      />

      {/* Strategic HR KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PresidentKpiCard
          label="Monthly Payroll Expense"
          value={formatInrCompact(kpis.monthlyPayroll.amount)}
          sub={`${kpis.monthlyPayroll.momTrend >= 0 ? '+' : ''}${kpis.monthlyPayroll.momTrend}% month-over-month`}
          icon={IndianRupee}
          accent="navy"
          className="h-full"
        />
        <PresidentKpiCard
          label="Overall Faculty-to-Student Ratio"
          value={formatFacultyRatio(kpis.facultyStudentRatio.studentsPerFaculty)}
          sub="UGC benchmark: 1:15 (optimal) · 1:20 (warning threshold)"
          icon={Users}
          accent="navy"
          className="h-full"
        />
        <PresidentKpiCard
          label="Faculty Retention Rate"
          value={`${kpis.retentionRate}%`}
          sub="Rolling 12-month voluntary attrition adjusted"
          icon={UserCheck}
          accent="navy"
          className="h-full"
        />
        <PresidentKpiCard
          label="Pending Executive Actions"
          value={String(kpis.pendingActions)}
          sub="Actions Required"
          icon={CheckSquare}
          accent="navy"
          className="h-full"
        />
      </div>

      {/* Visual Analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard
          title="Faculty Shortage vs. Sanctioned Posts"
          description="Top departments with unfilled sanctioned faculty positions"
        >
          <FacultyShortageBarChart data={FACULTY_SHORTAGE_DATA} />
        </ExecutiveCard>
        <ExecutiveCard
          title="Monthly Payroll Burn Trend"
          description="Consolidated faculty & staff payroll outflow — last 6 months"
        >
          <PayrollBurnAreaChart data={payrollTrend} />
        </ExecutiveCard>
      </div>

      {/* Executive Action Inbox */}
      <section ref={inboxRef} id="executive-action-inbox" className="scroll-mt-24">
        <ExecutiveCard
          title="Pending High-Level Appointments & Disciplinary Reviews"
          description={`${approvals.length} case${approvals.length === 1 ? '' : 's'} awaiting presidential decision`}
        >
        <div className="overflow-x-auto">
          {/* aria-label instead of sr-only <caption>: absolutely-positioned captions escape
              the table in Chromium and stretch the document, creating blank scroll space. */}
          <table
            className="w-full min-w-[960px] text-sm"
            aria-label="Pending executive appointments and disciplinary review cases"
          >
            <thead>
              <tr className="border-b border-sgvu-navy/10 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3">Candidate / Employee Name</th>
                <th scope="col" className="w-44 px-4 py-3">Department</th>
                <th scope="col" className="px-4 py-3">Action Type</th>
                <th scope="col" className="w-48 px-4 py-3 text-right">CTC / Financial Impact</th>
                <th scope="col" className="w-[380px] px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3.5 align-middle font-semibold text-sgvu-navy">{row.name}</td>
                  <td className="px-4 py-3.5 align-middle text-muted-foreground">{row.department}</td>
                  <td className="px-4 py-3.5 align-middle">{row.actionType}</td>
                  <td className="px-4 py-3.5 text-right align-middle font-mono font-semibold tabular-nums">
                    {formatInrCompact(row.ctcInr)}
                  </td>
                  <td className="px-4 py-3.5 align-middle">
                    <div className="flex flex-nowrap items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-sgvu-navy"
                        onClick={() => setDossierRow(row)}
                      >
                        View Dossier / CV
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
                        disabled={busyRowId === row.id}
                        onClick={() => void reviewRow(row, true)}
                      >
                        Approve & Ratify
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        disabled={busyRowId === row.id}
                        onClick={() => void reviewRow(row, false)}
                      >
                        Reject / Hold
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {approvals.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No pending executive actions — inbox clear.
            </p>
          ) : null}
        </div>
        </ExecutiveCard>
      </section>

      <Dialog
        open={dossierRow !== null}
        onOpenChange={(open) => {
          if (!open) setDossierRow(null);
        }}
      >
        <DialogContent className="max-w-md">
          {dossierRow ? (
            <>
              <DialogHeader>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Executive Dossier
                </p>
                <DialogTitle className="mt-1 text-xl font-black text-sgvu-navy">
                  {dossierRow.name}
                </DialogTitle>
                <DialogDescription>{dossierRow.actionType}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Department
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-sgvu-navy">{dossierRow.department}</p>
                </div>
                <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    CTC / Financial Impact
                  </p>
                  <p className="mt-1.5 font-mono text-sm font-black tabular-nums text-sgvu-navy">
                    {formatInrCompact(dossierRow.ctcInr)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Case Status
                </p>
                <Badge variant="outline" className="border-sgvu-gold/40 bg-sgvu-gold/10 text-sgvu-navy">
                  {dossierRow.requestId ? 'Pending presidential decision' : 'Demo case'}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Full CV and supporting documents are managed by the HR document vault. Decisions
                taken here are recorded against the approval request.
              </p>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  disabled={busyRowId === dossierRow.id}
                  onClick={() => {
                    void reviewRow(dossierRow, false);
                    setDossierRow(null);
                  }}
                >
                  Reject / Hold
                </Button>
                <Button
                  type="button"
                  className="bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
                  disabled={busyRowId === dossierRow.id}
                  onClick={() => {
                    void reviewRow(dossierRow, true);
                    setDossierRow(null);
                  }}
                >
                  Approve & Ratify
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
