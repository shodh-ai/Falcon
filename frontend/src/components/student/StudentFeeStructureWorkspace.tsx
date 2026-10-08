'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Headphones,
  Loader2,
  Mail,
  Phone,
  Wallet,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { formatInr } from '@/components/finance/FinancePageHeader';
import {
  RazorpayCheckout,
  type PaymentOrder,
} from '@/components/finance/RazorpayCheckout';
import { downloadVaultPdf } from '@/lib/student/vault-pdf';
import { cn } from '@/lib/utils';
import {
  DEMO_ATTENDANCE_SUMMARY,
  DEMO_FEE_PAYMENTS,
  DEMO_FEE_STRUCTURE,
  DEMO_STUDENT,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';

type FeeStructureRow = {
  demand_id: string;
  fee_head: string;
  academic_year: string;
  semester: number | null;
  amount: number;
  fee_concession: number;
  scholarship: number;
  discount: number;
  credit: number;
  paid_amount: number;
  payable_amount: number;
  due_date: string | null;
  status: string;
};

type PaymentRow = {
  transaction_id: string;
  amount: string;
  payment_mode: string | null;
  receipt_url: string | null;
  created_at: string;
  gateway_payment_id: string | null;
  fee_head: string | null;
  demand_id?: string | null;
  semester?: number | null;
};

type Ledger = {
  fee_structure?: FeeStructureRow[];
  pending_demands: FeeStructureRow[];
  payment_history: PaymentRow[];
  total_outstanding: number;
  gates: {
    admit_card_locked: boolean;
    no_dues_blocked: boolean;
    hostel_fines_pending: number;
    message: string;
  };
};

type SemesterAgg = {
  semester: number;
  academicYear: string;
  totalFee: number;
  paid: number;
  pending: number;
  dueDate: string | null;
  status: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';
  rows: FeeStructureRow[];
};

function parseDue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const d = raw.includes('T')
    ? new Date(raw)
    : new Date(`${raw.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDueDate(value: string | null | undefined) {
  const d = parseDue(value);
  if (!d) return 'Not set';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPaymentDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function feeHeadLabel(head: string | null | undefined) {
  if (!head) return 'Fee payment';
  return head.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'PAID') {
    return {
      label: 'Paid',
      className: 'border-transparent bg-emerald-100 text-emerald-800',
      helper: 'All dues for this view are cleared.',
    };
  }
  if (s === 'OVERDUE') {
    return {
      label: 'Overdue',
      className: 'border-transparent bg-rose-100 text-rose-800',
      helper: 'Payment is past the due date. Please pay to avoid late fees.',
    };
  }
  if (s === 'PARTIAL' || s === 'PARTIALLY_PAID') {
    return {
      label: 'Partial',
      className: 'border-transparent bg-amber-100 text-amber-900',
      helper: 'Some amount is paid. Clear the pending balance to stay current.',
    };
  }
  return {
    label: 'Pending',
    className: 'border-sgvu-navy/15 bg-slate-100 text-sgvu-navy',
    helper: 'No payment recorded yet for the pending amount.',
  };
}

function FinanceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading fees">
      <div className="h-44 animate-pulse rounded-2xl border border-sgvu-navy/10 bg-slate-100" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-sgvu-navy/10 bg-slate-100"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-sgvu-navy/10 bg-slate-100" />
    </div>
  );
}

export function StudentFeeStructureWorkspace() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState<number | 'all'>(
    'all',
  );
  const [semesterReady, setSemesterReady] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [checkout, setCheckout] = useState<{
    demandId: string;
    order: PaymentOrder;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void api
      .get<Ledger>('/api/student/finance')
      .then((payload) => {
        const empty = !(
          payload.fee_structure?.length || payload.pending_demands?.length
        );
        if (empty && isStudentDemoModeEnabled()) {
          setLedger({
            ...payload,
            fee_structure: DEMO_FEE_STRUCTURE,
            pending_demands: DEMO_FEE_STRUCTURE.filter(
              (r) => r.payable_amount > 0,
            ),
            payment_history: DEMO_FEE_PAYMENTS.map((p) => ({ ...p })),
            total_outstanding: DEMO_FEE_STRUCTURE.reduce(
              (s, r) => s + r.payable_amount,
              0,
            ),
            gates: payload.gates ?? {
              admit_card_locked: true,
              no_dues_blocked: true,
              hostel_fines_pending: 0,
              message:
                'Clear outstanding fee demands to unlock your admit card and no-dues certificate.',
            },
          });
        } else {
          setLedger(payload);
        }
      })
      .catch(() => {
        if (!isStudentDemoModeEnabled()) {
          setLedger({
            fee_structure: [],
            pending_demands: [],
            payment_history: [],
            total_outstanding: 0,
            gates: {
              admit_card_locked: false,
              no_dues_blocked: false,
              hostel_fines_pending: 0,
              message: 'Fee ledger unavailable right now.',
            },
          });
          toast.error('Could not load fee ledger');
          return;
        }
        setLedger({
          fee_structure: DEMO_FEE_STRUCTURE,
          pending_demands: DEMO_FEE_STRUCTURE.filter((r) => r.payable_amount > 0),
          payment_history: DEMO_FEE_PAYMENTS.map((p) => ({ ...p })),
          total_outstanding: DEMO_FEE_STRUCTURE.reduce(
            (s, r) => s + r.payable_amount,
            0,
          ),
          gates: {
            admit_card_locked: true,
            no_dues_blocked: true,
            hostel_fines_pending: 0,
            message:
              'Clear outstanding fee demands to unlock your admit card and no-dues certificate.',
          },
        });
      })
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const structureRows = useMemo(() => {
    if (ledger?.fee_structure?.length) return ledger.fee_structure;
    if (ledger?.pending_demands?.length) return ledger.pending_demands;
    return isStudentDemoModeEnabled() ? DEMO_FEE_STRUCTURE : [];
  }, [ledger]);

  const semesterOptions = useMemo(() => {
    const fromFees = structureRows
      .map((r) => (r.semester != null ? Number(r.semester) : null))
      .filter((n): n is number => n != null && Number.isFinite(n));
    const programLength = isStudentDemoModeEnabled()
      ? DEMO_ATTENDANCE_SUMMARY.progression.length
      : Math.max(...fromFees, 1);
    const set = new Set<number>();
    for (let sem = 1; sem <= programLength; sem += 1) set.add(sem);
    for (const sem of fromFees) set.add(sem);
    return Array.from(set).sort((a, b) => a - b);
  }, [structureRows]);

  const payableDemand = useMemo(() => {
    const pool =
      selectedSemester === 'all'
        ? structureRows
        : structureRows.filter((r) => Number(r.semester) === selectedSemester);
    return (
      pool.find(
        (r) =>
          r.payable_amount > 0 &&
          !['PAID', 'WAIVED'].includes(String(r.status).toUpperCase()),
      ) ?? null
    );
  }, [structureRows, selectedSemester]);

  async function startPay(demandId: string) {
    if (!isLaunchModuleEnabled('finance')) {
      toast.error('Online fee payment is not available. Contact Accounts.');
      return;
    }
    if (/^demo|drv-|local-/i.test(demandId) || demandId.startsWith('fee-demo')) {
      toast.error('Demo fee rows cannot be paid. Use live finance data.');
      return;
    }
    setPaying(true);
    try {
      const order = await api.post<PaymentOrder & { demand_id: string; order_id: string }>(
        '/api/student/finance/pay/order',
        { demand_id: demandId },
      );
      setCheckout({
        demandId,
        order: {
          order_id: order.order_id,
          amount_inr: order.amount_inr,
          fee_head: order.fee_head,
          razorpay_key: order.razorpay_key,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start checkout');
    } finally {
      setPaying(false);
    }
  }

  async function confirmPayment(paymentId: string) {
    if (!checkout) return;
    try {
      await api.post('/api/student/finance/pay', {
        demand_id: checkout.demandId,
        payment_id: paymentId,
        order_id: checkout.order.order_id,
      });
      toast.success('Payment successful — receipt added to your history');
      setCheckout(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment confirmation failed');
      throw e;
    }
  }

  useEffect(() => {
    if (semesterReady || structureRows.length === 0) return;
    const unpaid = structureRows.find(
      (r) => r.semester != null && r.payable_amount > 0,
    );
    if (unpaid?.semester != null) {
      setSelectedSemester(Number(unpaid.semester));
    } else if (semesterOptions.length > 0) {
      setSelectedSemester(semesterOptions[semesterOptions.length - 1]!);
    }
    setSemesterReady(true);
  }, [structureRows, semesterOptions, semesterReady]);

  const scopedRows = useMemo(() => {
    if (selectedSemester === 'all') return structureRows;
    return structureRows.filter((r) => Number(r.semester) === selectedSemester);
  }, [structureRows, selectedSemester]);

  const highlight = useMemo(() => {
    const totalFee = scopedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const paid = scopedRows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const pending = scopedRows.reduce(
      (s, r) => s + Number(r.payable_amount || 0),
      0,
    );

    const unpaidDates = scopedRows
      .filter((r) => r.payable_amount > 0 && r.due_date)
      .map((r) => r.due_date as string)
      .sort((a, b) => a.localeCompare(b));
    const anyDates = scopedRows
      .map((r) => r.due_date)
      .filter((d): d is string => Boolean(d))
      .sort((a, b) => a.localeCompare(b));
    const nextDue = unpaidDates[0] ?? anyDates[0] ?? null;

    let status: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE' = 'PENDING';
    if (pending <= 0 && totalFee > 0) status = 'PAID';
    else if (paid > 0 && pending > 0) status = 'PARTIAL';
    else if (pending > 0) status = 'PENDING';
    const due = parseDue(nextDue);
    if (pending > 0 && due && due.getTime() < Date.now()) status = 'OVERDUE';

    return { totalFee, paid, pending, nextDue, status };
  }, [scopedRows]);

  const semesterRows = useMemo(() => {
    const map = new Map<number, SemesterAgg>();
    for (const row of structureRows) {
      if (row.semester == null) continue;
      const existing = map.get(row.semester) ?? {
        semester: row.semester,
        academicYear: row.academic_year,
        totalFee: 0,
        paid: 0,
        pending: 0,
        dueDate: null as string | null,
        status: 'PENDING' as SemesterAgg['status'],
        rows: [] as FeeStructureRow[],
      };
      existing.totalFee += Number(row.amount || 0);
      existing.paid += Number(row.paid_amount || 0);
      existing.pending += Number(row.payable_amount || 0);
      existing.rows.push(row);
      if (row.academic_year) existing.academicYear = row.academic_year;
      if (row.due_date) {
        if (
          !existing.dueDate ||
          (row.payable_amount > 0 && row.due_date < existing.dueDate) ||
          (!existing.rows.some((r) => r.payable_amount > 0) &&
            row.due_date > existing.dueDate)
        ) {
          if (row.payable_amount > 0 || !existing.dueDate) {
            existing.dueDate = row.due_date;
          }
        }
      }
      map.set(row.semester, existing);
    }

    return Array.from(map.values())
      .map((agg) => {
        let status: SemesterAgg['status'] = 'PENDING';
        if (agg.pending <= 0) status = 'PAID';
        else if (agg.paid > 0) status = 'PARTIAL';
        const due = parseDue(agg.dueDate);
        if (agg.pending > 0 && due && due.getTime() < Date.now()) {
          status = 'OVERDUE';
        }
        return { ...agg, status };
      })
      .sort((a, b) => a.semester - b.semester);
  }, [structureRows]);

  const allPayments = useMemo(() => {
    return [...(ledger?.payment_history ?? [])].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [ledger?.payment_history]);

  const payments = useMemo(() => allPayments.slice(0, 5), [allPayments]);

  const receiptsByDemand = useMemo(() => {
    const map = new Map<string, PaymentRow>();
    for (const row of allPayments) {
      if (row.demand_id && !map.has(row.demand_id)) {
        map.set(row.demand_id, row);
      }
    }
    return map;
  }, [allPayments]);

  const hasData = structureRows.length > 0;
  const statusMeta = statusBadge(highlight.status);

  async function downloadFormattedReceipt(
    row: PaymentRow,
    key: string,
  ): Promise<void> {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      if (row.receipt_url && row.receipt_url !== '#') {
        if (row.receipt_url.startsWith('http')) {
          window.open(row.receipt_url, '_blank', 'noopener,noreferrer');
        } else {
          window.open(
            `/api/uploads/download?path=${encodeURIComponent(row.receipt_url)}`,
            '_blank',
            'noopener,noreferrer',
          );
        }
      }

      await downloadVaultPdf({
        kind: 'receipt',
        title: `${feeHeadLabel(row.fee_head)} Receipt`,
        status: 'PAID',
        filename: `SGVU-Fee-Receipt-${row.transaction_id}.pdf`,
        fields: [
          {
            label: 'Transaction ID',
            value: row.gateway_payment_id || row.transaction_id,
          },
          { label: 'Payment date', value: formatPaymentDate(row.created_at) },
          { label: 'Amount paid', value: formatInr(row.amount) },
          { label: 'Payment method', value: row.payment_mode || 'Online' },
          { label: 'Fee head', value: feeHeadLabel(row.fee_head) },
          {
            label: 'Semester',
            value: row.semester != null ? `Semester ${row.semester}` : '—',
          },
          { label: 'Receipt status', value: 'Paid / Settled' },
        ],
        student: {
          name: user?.name || 'Student',
          enrollmentNo: user?.email || '—',
          program: '—',
        },
      });
      toast.success('Receipt PDF downloaded');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not download receipt PDF',
      );
    } finally {
      setDownloadingKey(null);
    }
  }

  function resolveSemesterReceipt(sem: SemesterAgg): PaymentRow | null {
    for (const row of sem.rows) {
      const hit = receiptsByDemand.get(row.demand_id);
      if (hit) return hit;
    }
    return (
      allPayments.find((p) => Number(p.semester) === sem.semester) ?? null
    );
  }

  async function downloadLatestReceipt() {
    const latest = payments[0];
    if (!latest) {
      toast.info('No payments yet — receipts appear after a successful payment.');
      return;
    }
    await downloadFormattedReceipt(latest, `header-${latest.transaction_id}`);
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Fees & Payments"
        description="Review your fee structure, pay outstanding dues securely, and download receipts."
        eyebrow="Student Finance"
        actions={
          <label className="flex w-full flex-col gap-1.5 sm:w-52">
            <span className="text-xs font-semibold text-muted-foreground">
              Semester
            </span>
            <Select
              value={
                selectedSemester === 'all' ? 'all' : String(selectedSemester)
              }
              onValueChange={(v) => {
                setSelectedSemester(v === 'all' ? 'all' : Number(v));
              }}
            >
              <SelectTrigger
                aria-label="Select semester"
                className="h-11 rounded-xl border border-sgvu-navy bg-sgvu-navy px-3 text-sm font-semibold text-white hover:bg-[#123A6D] focus:ring-2 focus:ring-sgvu-gold/40 [&>svg]:text-white"
              >
                <SelectValue placeholder="Select semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All semesters</SelectItem>
                {semesterOptions.map((sem) => (
                  <SelectItem key={sem} value={String(sem)}>
                    Semester {sem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        }
      />

      {loading ? (
        <FinanceSkeleton />
      ) : !hasData ? (
        <StudentEmptyState
          icon={Wallet}
          title="No fee records yet"
          description="When Finance publishes your semester fees, they will appear here."
        />
      ) : (
        <div className="space-y-8">
          {/* Highlight card */}
          <section
            aria-label="Current fee status"
            className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white p-4 shadow-sm transition sm:rounded-[1.75rem] sm:p-6 md:p-8"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                  {selectedSemester === 'all'
                    ? 'Overall status'
                    : `Semester ${selectedSemester}`}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black tracking-tight text-sgvu-navy md:text-4xl">
                    {statusMeta.label}
                  </h2>
                  <Badge className={cn('border text-sm', statusMeta.className)}>
                    {statusMeta.label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {statusMeta.helper}
                  {highlight.pending > 0
                    ? ` Pending balance: ${formatInr(highlight.pending)}.`
                    : ''}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                {highlight.pending > 0 && payableDemand ? (
                  <Button
                    size="lg"
                    className="w-full min-w-0 bg-sgvu-navy px-6 text-white hover:bg-[#123A6D] sm:w-auto sm:min-w-[140px]"
                    disabled={paying || !!checkout}
                    onClick={() => void startPay(payableDemand.demand_id)}
                  >
                    {paying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      <>
                        <Wallet className="h-4 w-4" />
                        Pay Now
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full min-w-0 border-sgvu-navy/20 bg-white px-6 text-sgvu-navy hover:bg-sgvu-gold/15 active:bg-sgvu-gold active:text-sgvu-navy sm:w-auto sm:min-w-[160px]"
                  disabled={payments.length === 0 || !!downloadingKey}
                  onClick={() => void downloadLatestReceipt()}
                >
                  {downloadingKey?.startsWith('header-') ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Preparing…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download Receipt
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-8 grid gap-6 border-t border-sgvu-navy/8 pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Fee</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-sgvu-navy md:text-3xl">
                  {formatInr(highlight.totalFee)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paid Amount</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 md:text-3xl">
                  {formatInr(highlight.paid)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700 md:text-3xl">
                  {formatInr(highlight.pending)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="mt-1 text-2xl font-bold text-sgvu-navy md:text-3xl">
                  {formatDueDate(highlight.nextDue)}
                </p>
              </div>
            </div>
          </section>

          {/* Payment summary */}
          <section aria-label="Payment summary">
            <h3 className="mb-4 text-lg font-bold text-sgvu-navy">
              Payment summary
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {[
                {
                  label: 'Total Fee',
                  value: formatInr(highlight.totalFee),
                  tone: 'text-sgvu-navy',
                  onClick: () => setSelectedSemester('all'),
                },
                {
                  label: 'Paid',
                  value: formatInr(highlight.paid),
                  tone: 'text-emerald-700',
                },
                {
                  label: 'Pending',
                  value: formatInr(highlight.pending),
                  tone: 'text-rose-700',
                  onClick: () => {
                    const unpaid = semesterRows.find((s) => s.pending > 0);
                    if (unpaid) setSelectedSemester(unpaid.semester);
                  },
                },
              ].map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={card.onClick}
                  className={cn(
                    'rounded-2xl border border-sgvu-navy/10 bg-white p-6 text-left shadow-sm transition',
                    'hover:-translate-y-0.5 hover:border-sgvu-gold/50 hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/45',
                    card.onClick ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </p>
                  <p
                    className={cn(
                      'mt-3 text-3xl font-black tracking-tight tabular-nums',
                      card.tone,
                    )}
                  >
                    {card.value}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Semester table */}
          <StudentSectionCard
            title="Semester fees"
            description="Tap a row to filter the status card above, or download a receipt."
          >
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50/90 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3.5">Semester</th>
                    <th className="px-5 py-3.5">Total Fee</th>
                    <th className="px-5 py-3.5">Paid</th>
                    <th className="px-5 py-3.5">Pending</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {semesterRows.map((sem) => {
                    const badge = statusBadge(sem.status);
                    const receiptRow = resolveSemesterReceipt(sem);
                    const selected =
                      selectedSemester !== 'all' &&
                      selectedSemester === sem.semester;
                    const receiptKey = `sem-${sem.semester}`;
                    return (
                      <tr
                        key={sem.semester}
                        className={cn(
                          'border-t border-border/60 transition',
                          selected
                            ? 'bg-sgvu-gold/10'
                            : 'hover:bg-sgvu-gold/5',
                        )}
                      >
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/40"
                            onClick={() => setSelectedSemester(sem.semester)}
                          >
                            <p className="text-base font-semibold text-sgvu-navy">
                              Semester {sem.semester}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {sem.academicYear}
                              {sem.dueDate
                                ? ` · Due ${formatDueDate(sem.dueDate)}`
                                : ''}
                            </p>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-base font-medium tabular-nums text-sgvu-navy">
                          {formatInr(sem.totalFee)}
                        </td>
                        <td className="px-5 py-4 text-base tabular-nums text-emerald-700">
                          {formatInr(sem.paid)}
                        </td>
                        <td className="px-5 py-4 text-base font-semibold tabular-nums text-rose-700">
                          {formatInr(sem.pending)}
                        </td>
                        <td className="px-5 py-4">
                          <Badge className={cn('border', badge.className)}>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {sem.pending > 0 ? (
                              <Button
                                size="sm"
                                className="h-9 bg-sgvu-navy px-4 text-white hover:bg-[#123A6D]"
                                disabled={paying || !!checkout}
                                onClick={() => {
                                  const demand = sem.rows.find(
                                    (r) => r.payable_amount > 0,
                                  );
                                  if (demand) void startPay(demand.demand_id);
                                }}
                              >
                                <Wallet className="h-3.5 w-3.5" />
                                Pay
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 border-sgvu-navy/15 px-4 text-sgvu-navy"
                              disabled={!receiptRow || downloadingKey === receiptKey}
                              onClick={() =>
                                receiptRow &&
                                void downloadFormattedReceipt(
                                  receiptRow,
                                  receiptKey,
                                )
                              }
                            >
                              {downloadingKey === receiptKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              Receipt
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </StudentSectionCard>

          {/* Recent payments */}
          <StudentSectionCard
            title="Recent payments"
            description="Last 5 successful transactions — download a formatted PDF receipt anytime"
          >
            {payments.length === 0 ? (
              <StudentEmptyState
                title="No payments yet"
                description="Successful payments will show here with a receipt download."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50/90 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Amount</th>
                      <th className="px-5 py-3.5">Payment Method</th>
                      <th className="px-5 py-3.5 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((row) => {
                      const key = `pay-${row.transaction_id}`;
                      const busy = downloadingKey === key;
                      return (
                        <tr
                          key={row.transaction_id}
                          className="border-t border-border/60 hover:bg-sgvu-gold/5"
                        >
                          <td className="px-5 py-4 text-base text-sgvu-navy">
                            <p>{formatPaymentDate(row.created_at)}</p>
                            <p className="text-xs text-muted-foreground">
                              {feeHeadLabel(row.fee_head)}
                              {row.semester != null
                                ? ` · Sem ${row.semester}`
                                : ''}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-base font-semibold tabular-nums text-sgvu-navy">
                            {formatInr(row.amount)}
                          </td>
                          <td className="px-5 py-4 text-base text-muted-foreground">
                            {row.payment_mode || 'Online'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 border-sgvu-navy/15 text-sgvu-navy"
                              disabled={busy}
                              onClick={() =>
                                void downloadFormattedReceipt(row, key)
                              }
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              {busy ? 'Preparing…' : 'Receipt'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </StudentSectionCard>

          {/* Finance help */}
          <StudentSectionCard
            title="Finance help"
            description="Contact the university finance office for fee queries"
            icon={Headphones}
          >
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Finance Office</p>
                <p className="mt-1 text-base font-semibold text-sgvu-navy">
                  Student Finance · Admin Block
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a
                    href="mailto:finance@mygyanvihar.com"
                    className="mt-1 block text-base font-semibold text-sgvu-navy underline-offset-2 hover:underline"
                  >
                    finance@mygyanvihar.com
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <a
                    href="tel:+911412780000"
                    className="mt-1 block text-base font-semibold text-sgvu-navy underline-offset-2 hover:underline"
                  >
                    +91 141 278 0000
                  </a>
                </div>
              </div>
            </div>
          </StudentSectionCard>
        </div>
      )}

      {checkout ? (
        <RazorpayCheckout
          open
          order={checkout.order}
          studentName={user?.name ?? undefined}
          studentEmail={user?.email ?? undefined}
          onClose={() => setCheckout(null)}
          onSuccess={confirmPayment}
        />
      ) : null}
    </StudentPageShell>
  );
}
