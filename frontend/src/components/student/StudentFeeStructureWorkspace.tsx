'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Headphones, Loader2, ReceiptText, Wallet } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { formatInr } from '@/components/finance/FinancePageHeader';
import { RazorpayCheckout, type PaymentOrder } from '@/components/finance/RazorpayCheckout';
import { vaultDownloadPath, vaultFileType } from '@/lib/student-vault-file';
import { withStudentReadTimeout } from '@/lib/student-read-request';
import { cn } from '@/lib/utils';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';
import { useStudentClock } from '@/components/student/useStudentClock';

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

type CourseSemesters = {
  subject_wise: { semester: number | string; status: string }[];
};

function money(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function outstanding(row: FeeStructureRow) {
  // Match the finance API: paid and waived demands are not collectible.
  return ['PAID', 'WAIVED'].includes(row.status.toUpperCase())
    ? 0
    : Math.max(0, money(row.payable_amount));
}

function waivedAmount(row: FeeStructureRow) {
  return row.status.toUpperCase() === 'WAIVED'
    ? Math.max(0, money(row.amount) - money(row.fee_concession) - money(row.paid_amount))
    : 0;
}

function feeHeadLabel(head: string | null | undefined) {
  return (head || 'Fee payment').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function indiaDateKey(value: number | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dueDateKey(value: string | null) {
  if (!value) return null;
  // A SQL date has no time of day. Keep the whole due day available for payment.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : indiaDateKey(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function isOverdue(row: FeeStructureRow, today: string) {
  const due = dueDateKey(row.due_date);
  return outstanding(row) > 0 && due !== null && due < today;
}

function feeStatus(row: FeeStructureRow, today: string) {
  if (row.status.toUpperCase() === 'WAIVED') {
    return { label: 'Fee waived', color: 'bg-slate-100 text-slate-700' };
  }
  if (outstanding(row) === 0) {
    return { label: 'Paid', color: 'bg-emerald-50 text-emerald-800' };
  }
  if (isOverdue(row, today)) {
    return { label: 'Overdue', color: 'bg-rose-50 text-rose-700' };
  }
  return money(row.paid_amount) > 0
    ? { label: 'Partly paid', color: 'bg-amber-50 text-amber-900' }
    : { label: 'Not paid yet', color: 'bg-slate-100 text-slate-700' };
}

function FinanceSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading fees">
      <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}

export function StudentFeeStructureWorkspace() {
  const { user, token } = useAuth();
  // Never keep another account's balances or checkout open after an account change.
  return <StudentFeeContent key={`${user?.tenant_id}:${user?.user_id}:${token}`} />;
}

function StudentFeeContent() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [courseSemesters, setCourseSemesters] = useState<number[]>([]);
  const [semesterListError, setSemesterListError] = useState(false);
  const [semesterListVersion, setSemesterListVersion] = useState(0);
  const [semester, setSemester] = useState<number | 'all'>('all');
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [feeDialog, setFeeDialog] = useState<{ semester: number | null; mode: 'pay' | 'details' | 'receipts' } | null>(null);
  const [checkout, setCheckout] = useState<{ demandId: string; order: PaymentOrder } | null>(null);
  const now = useStudentClock(60_000);
  const today = indiaDateKey(now)!;

  useEffect(() => {
    let active = true;
    void withStudentReadTimeout(api.get<Ledger>('/api/student/finance'))
      .then((payload) => {
        if (!payload || !Array.isArray(payload.payment_history)
          || !Array.isArray(payload.fee_structure ?? payload.pending_demands)) {
          throw new Error('Fee ledger unavailable');
        }
        if (active) setLedger(payload);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, loadVersion]);

  useEffect(() => {
    let active = true;
    // These are the student's actual course enrollments. The attendance
    // progression list is a fixed template, not an assigned-program semester list.
    void withStudentReadTimeout(api.get<CourseSemesters>('/api/student/attendance'))
      .then((payload) => {
        if (!payload || !Array.isArray(payload.subject_wise)) {
          throw new Error('Course semesters unavailable');
        }
        const semesters = payload.subject_wise
          .filter((row) => ['ENROLLED', 'COMPLETED', 'FAILED'].includes(row.status))
          .map((row) => Number(row.semester))
          .filter((value) => Number.isInteger(value) && value > 0);
        if (active) {
          setCourseSemesters([...new Set(semesters)]);
          setSemesterListError(false);
        }
      })
      .catch(() => { if (active) setSemesterListError(true); });
    return () => { active = false; };
  }, [api, semesterListVersion]);

  function reload() {
    setLoading(true);
    setError(false);
    setLoadVersion((version) => version + 1);
  }

  const structureRows = useMemo(
    () => ledger?.fee_structure ?? ledger?.pending_demands ?? [],
    [ledger],
  );
  const demandMap = useMemo(
    () => new Map(structureRows.map((row) => [row.demand_id, row])),
    [structureRows],
  );
  function paymentSemester(payment: PaymentRow) {
    const demand = payment.demand_id ? demandMap.get(payment.demand_id) : undefined;
    return (demand ? demand.semester : payment.semester) ?? null;
  }
  const semesterOptions = Array.from(new Set([
    ...courseSemesters,
    ...structureRows.map((row) => row.semester),
    ...(ledger?.payment_history ?? []).map(paymentSemester),
  ].filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0))).sort((a, b) => a - b);
  const scopedRows = structureRows.filter((row) => semester === 'all' || row.semester === semester);
  const payments = (ledger?.payment_history ?? [])
    .filter((payment) => semester === 'all' || paymentSemester(payment) === semester)
    .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const sum = (read: (row: FeeStructureRow) => number) =>
    money(scopedRows.reduce((total, row) => total + read(row), 0));
  const paid = sum((row) => money(row.paid_amount));
  const pending = sum(outstanding);
  const total = money(paid + pending);
  const reductions = sum((row) => money(row.fee_concession));
  const waived = sum(waivedAmount);
  const overdue = sum((row) => isOverdue(row, today) ? outstanding(row) : 0);
  const firstDue = scopedRows.filter((row) => outstanding(row) > 0 && dueDateKey(row.due_date))
    .sort((a, b) => dueDateKey(a.due_date)!.localeCompare(dueDateKey(b.due_date)!))[0]?.due_date;
  const paidPercent = total > 0 ? Math.min(100, Math.max(0, paid / total * 100)) : 0;
  const scopeLabel = semester === 'all' ? 'All semesters' : `Semester ${semester}`;
  const hasData = structureRows.length > 0 || (ledger?.payment_history.length ?? 0) > 0;
  const financeEnabled = isLaunchModuleEnabled('finance');
  const groupNumbers: (number | null)[] = semester === 'all' ? [...semesterOptions] : [semester];
  if (semester === 'all' && (structureRows.some((row) => row.semester === null)
    || payments.some((payment) => paymentSemester(payment) === null))) {
    groupNumbers.push(null);
  }
  const semesterGroups = groupNumbers.map((number) => {
    const rows = structureRows.filter((row) => row.semester === number);
    const groupPaid = money(rows.reduce((sum, row) => sum + money(row.paid_amount), 0));
    const groupPending = money(rows.reduce((sum, row) => sum + outstanding(row), 0));
    const due = rows.filter((row) => outstanding(row) > 0 && dueDateKey(row.due_date))
      .sort((a, b) => dueDateKey(a.due_date)!.localeCompare(dueDateKey(b.due_date)!))[0]?.due_date;
    const status = !rows.length
      ? { label: 'Not assigned', color: 'bg-slate-100 text-slate-700' }
      : rows.every((row) => row.status.toUpperCase() === 'WAIVED')
        ? { label: 'Fee waived', color: 'bg-slate-100 text-slate-700' }
        : groupPending === 0
          ? { label: rows.some((row) => row.status.toUpperCase() === 'WAIVED') ? 'Cleared' : 'Paid', color: 'bg-emerald-50 text-emerald-800' }
          : rows.some((row) => isOverdue(row, today))
            ? { label: 'Overdue', color: 'bg-rose-50 text-rose-700' }
            : { label: groupPaid > 0 ? 'Partly paid' : 'Not paid yet', color: 'bg-amber-50 text-amber-900' };
    return {
      semester: number,
      label: number === null ? 'General fees' : `Semester ${number}`,
      rows,
      total: money(groupPaid + groupPending),
      paid: groupPaid,
      pending: groupPending,
      due,
      status,
      years: [...new Set(rows.map((row) => row.academic_year).filter(Boolean))].join(', '),
      hasReceipt: payments.some((payment) => paymentSemester(payment) === number
        && payment.receipt_url?.trim() && payment.receipt_url.trim() !== '#'),
    };
  });
  const dialogLabel = feeDialog?.semester == null ? 'General fees' : `Semester ${feeDialog.semester}`;
  const dialogRows = feeDialog ? structureRows.filter((row) => row.semester === feeDialog.semester) : [];
  const dialogPayments = feeDialog ? (ledger?.payment_history ?? [])
    .filter((payment) => paymentSemester(payment) === feeDialog.semester)
    .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];


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
      setFeeDialog(null);
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
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment confirmation failed');
      throw e;
    }
  }


  async function downloadReceipt(payment: PaymentRow) {
    if (downloadingKey || !payment.receipt_url) return;
    setDownloadingKey(payment.transaction_id);
    try {
      const blob = await withStudentReadTimeout(api.getBlob(vaultDownloadPath(payment.receipt_url)));
      const { extension } = vaultFileType(blob);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fee-receipt-${payment.transaction_id.replace(/[^a-zA-Z0-9_-]/g, '')}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      toast.error('Could not download the original receipt. Please try again or contact Finance.');
    } finally {
      setDownloadingKey(null);
    }
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Fees & Payments"
        eyebrow="Student finance"
        description="See your total fees, what you have paid, and what is left to pay."
        actions={
          <div className="w-full space-y-1.5 sm:w-44">
            <label htmlFor="fee-semester" className="text-xs font-medium text-sgvu-navy">View fees for</label>
            <Select
              value={String(semester)}
              onValueChange={(value) => setSemester(value === 'all' ? 'all' : Number(value))}
              disabled={loading || error}
            >
              <SelectTrigger id="fee-semester" aria-label="Select semester"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All semesters</SelectItem>
                {semesterOptions.map((value) => <SelectItem key={value} value={String(value)}>Semester {value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {semesterListError ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>The course semester list is unavailable. Semesters with fee records are still shown.</p>
          <Button variant="outline" size="sm" onClick={() => {
            setSemesterListError(false);
            setSemesterListVersion((version) => version + 1);
          }}>Retry semester list</Button>
        </div>
      ) : null}

      {loading ? <FinanceSkeleton /> : error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-6">
          <h2 className="font-semibold text-sgvu-navy">We couldn’t load your fees</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your balance is unavailable right now. Retry or check your payment history before paying again.</p>
          <Button variant="outline" className="mt-4" onClick={reload}>Retry fees</Button>
        </div>
      ) : !hasData || (semester !== 'all' && !scopedRows.length && !payments.length) ? (
        <StudentEmptyState
          icon={Wallet}
          title={semester === 'all' ? 'No fee records yet' : 'No fees assigned yet'}
          description={semester === 'all'
            ? 'Your fees will appear here when Finance assigns them to your account.'
            : `No fees have been billed for Semester ${semester} yet. They will appear here when Finance assigns them.`}
        />
      ) : (
        <>
          <section aria-label="Fee summary" className="overflow-hidden rounded-2xl border border-sgvu-navy/15 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
              <h2 className="text-base font-bold text-sgvu-navy">Your fees at a glance</h2>
              <span className="rounded-full bg-sgvu-navy/5 px-3 py-1 text-xs font-medium text-sgvu-navy">{scopeLabel}</span>
            </div>
            <dl className="grid gap-4 p-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-sgvu-navy/10 sm:p-6">
              <div className="min-w-0 sm:pr-5">
                <dt className="text-sm text-muted-foreground">Your total fees</dt>
                <dd className="mt-1 break-words text-2xl font-black tabular-nums text-sgvu-navy">{formatInr(total)}</dd>
                <p className="mt-1 text-xs text-muted-foreground">{reductions > 0 || waived > 0 ? 'After scholarships, reductions and waivers' : 'Fees billed to your account'}</p>
              </div>
              <div className="min-w-0 sm:px-5">
                <dt className="text-sm text-muted-foreground">You have paid</dt>
                <dd className="mt-1 break-words text-2xl font-black tabular-nums text-emerald-700">{formatInr(paid)}</dd>
                <p className="mt-1 text-xs text-muted-foreground">Payments recorded by Finance</p>
              </div>
              <div className="min-w-0 sm:pl-5">
                <dt className="text-sm text-muted-foreground">Amount left to pay</dt>
                <dd className={cn('mt-1 break-words text-2xl font-black tabular-nums', pending > 0 ? 'text-rose-700' : 'text-emerald-700')}>{formatInr(pending)}</dd>
                <p className="mt-1 text-xs text-muted-foreground">Total fees minus amount paid</p>
              </div>
            </dl>
            <div className="space-y-3 border-t border-sgvu-navy/10 bg-slate-50/70 p-4 sm:px-6">
              {total > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-sgvu-navy">{paidPercent.toFixed(0)}% of your fees paid</p>
                  <div role="progressbar" aria-label="Fees paid" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(paidPercent.toFixed(2))} className="h-2 overflow-hidden rounded-full bg-sgvu-navy/10">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${paidPercent}%` }} />
                  </div>
                </div>
              ) : null}
              {reductions > 0 || waived > 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Original fees: {formatInr(sum((row) => money(row.amount)))}
                  {reductions > 0 ? ` · Scholarships & adjustments: −${formatInr(reductions)}` : ''}
                  {waived > 0 ? ` · Fee waivers: −${formatInr(waived)}` : ''}
                </p>
              ) : null}
              {pending > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    {overdue > 0 ? <p className="font-semibold text-rose-700">{formatInr(overdue)} is overdue</p> : null}
                    <p className="text-muted-foreground">{firstDue ? `Earliest unpaid due date: ${formatDate(firstDue)}` : 'A due date has not been set. Contact Finance for details.'}</p>
                  </div>
                  <a href="#fee-breakdown" className="font-semibold text-sgvu-navy underline underline-offset-4">View fees to pay</a>
                </div>
              ) : scopedRows.length > 0 ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />No fees left to pay in this view.</p>
              ) : <p className="text-sm text-muted-foreground">No fees have been assigned for this semester.</p>}
              <p className="text-xs text-muted-foreground">Fees issued so far. Future semesters not yet billed are not included.</p>
            </div>
          </section>

          {ledger?.gates?.message && (ledger.gates.admit_card_locked || ledger.gates.no_dues_blocked) ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span className="font-semibold">Account notice: </span>{ledger.gates.message}
            </p>
          ) : null}

          <div id="fee-breakdown" className="scroll-mt-6">
            <StudentSectionCard
              title="Semester fees"
              description="Choose a semester to view its totals, pay a fee, or download a receipt."
              headerClassName="p-4 pb-3 sm:p-4 sm:pb-3"
              contentClassName="p-4 pt-0 sm:p-4 sm:pt-0"
            >
              {!financeEnabled && pending > 0 ? <p className="mb-3 text-sm text-muted-foreground">Online payment is unavailable. Please contact Finance to arrange payment.</p> : null}
              <div role="region" aria-label="Semester fees table" tabIndex={0} className="overflow-x-auto rounded-xl border border-sgvu-navy/15 focus-visible:outline-2 focus-visible:outline-sgvu-gold">
                <table aria-label="Semester fees" className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-sgvu-navy/15 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-3">Semester</th>
                      <th scope="col" className="px-3 py-3 text-right">Total fee</th>
                      <th scope="col" className="px-3 py-3 text-right">Paid</th>
                      <th scope="col" className="px-3 py-3 text-right">Pending</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sgvu-navy/10">
                    {semesterGroups.map((group) => (
                      <tr key={group.semester ?? 'general'} aria-label={group.label} className={cn(group.pending > 0 && 'bg-sgvu-gold/5')}>
                        <th scope="row" className="px-3 py-3 font-normal">
                          {group.semester !== null ? (
                            <button type="button" aria-label={`View fees for ${group.label}`}
                              className="rounded text-left font-semibold text-sgvu-navy hover:underline focus-visible:outline-2 focus-visible:outline-sgvu-gold"
                              onClick={() => setSemester(group.semester!)}>
                              {group.label}
                            </button>
                          ) : <span className="font-semibold text-sgvu-navy">{group.label}</span>}
                          {group.years ? <p className="mt-0.5 text-[11px] text-muted-foreground">{group.years}</p> : null}
                          {group.due ? <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">Due {formatDate(group.due)}</p> : null}
                        </th>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-sgvu-navy">{group.rows.length ? formatInr(group.total) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{group.rows.length ? formatInr(group.paid) : '—'}</td>
                        <td className={cn('whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums', group.pending > 0 ? 'text-rose-700' : 'text-sgvu-navy')}>{group.rows.length ? formatInr(group.pending) : '—'}</td>
                        <td className="px-3 py-3"><Badge variant="outline" className={cn('whitespace-nowrap border-transparent text-[10px]', group.status.color)}>{group.status.label}</Badge></td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {group.rows.length ? (
                              <Button size="sm" variant={group.pending > 0 ? 'default' : 'outline'}
                                disabled={paying || !!checkout || (group.pending > 0 && !financeEnabled)}
                                aria-label={group.pending > 0 ? `Pay fees for ${group.label}` : `View fee details for ${group.label}`}
                                className={cn('h-8 text-xs', group.pending > 0 && 'bg-sgvu-navy text-white hover:bg-sgvu-navy/90')}
                                onClick={() => setFeeDialog({ semester: group.semester, mode: group.pending > 0 ? 'pay' : 'details' })}>
                                {group.pending > 0 ? <Wallet className="mr-1.5 h-3.5 w-3.5" /> : null}
                                {group.pending > 0 ? 'Pay' : 'Details'}
                              </Button>
                            ) : null}
                            {group.hasReceipt ? (
                              <Button size="sm" variant="outline" className="h-8 text-xs"
                                aria-label={`View receipts for ${group.label}`}
                                onClick={() => setFeeDialog({ semester: group.semester, mode: 'receipts' })}>
                                <Download className="mr-1.5 h-3.5 w-3.5" />Receipts
                              </Button>
                            ) : null}
                            {!group.rows.length && !group.hasReceipt ? <span className="text-muted-foreground">—</span> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </StudentSectionCard>
          </div>

          <StudentSectionCard title="Payment history" description={`All recorded successful payments · ${scopeLabel.toLowerCase()}. Download the original receipt for each payment.`} icon={ReceiptText}>
            {payments.length ? (
              <ul className="divide-y divide-sgvu-navy/10">
                {payments.map((payment) => {
                  const paymentSem = paymentSemester(payment);
                  return (
                    <li key={payment.transaction_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="break-words text-sm font-semibold text-sgvu-navy">{feeHeadLabel(payment.fee_head)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(payment.created_at)} · {payment.payment_mode ? feeHeadLabel(payment.payment_mode.toLowerCase()) : 'Method not recorded'}{paymentSem ? ` · Semester ${paymentSem}` : ''}</p>
                        <p className="break-all text-xs text-muted-foreground">Reference: {payment.gateway_payment_id || payment.transaction_id}</p>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-4 sm:gap-6">
                        <span className="text-base font-bold tabular-nums text-emerald-700">{formatInr(payment.amount)}</span>
                        {payment.receipt_url?.trim() && payment.receipt_url.trim() !== '#' ? (
                          <Button size="sm" variant="outline" disabled={downloadingKey !== null}
                            aria-label={`Download receipt for ${feeHeadLabel(payment.fee_head)} on ${formatDate(payment.created_at)}`}
                            onClick={() => void downloadReceipt(payment)}>
                            {downloadingKey === payment.transaction_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Receipt
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">Receipt unavailable</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="py-4 text-sm text-muted-foreground">No successful payments recorded in this view yet.</p>}
          </StudentSectionCard>
        </>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-sgvu-navy/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-sgvu-navy" />
          <div>
            <p className="text-sm font-semibold text-sgvu-navy">Need help with your fees?</p>
            <p className="mt-1 text-xs text-muted-foreground">For a missing payment, receipt, or incorrect charge, contact Finance with your payment reference.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0"><Link href="/student/helpdesk">Ask for help</Link></Button>
      </div>
      <Dialog open={feeDialog !== null} onOpenChange={(open) => { if (!open) setFeeDialog(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="pr-6">
            <DialogTitle>{feeDialog?.mode === 'receipts' ? 'Semester receipts' : feeDialog?.mode === 'pay' ? 'Choose fee to pay' : 'Semester fee details'}</DialogTitle>
            <DialogDescription>
              {dialogLabel} · {feeDialog?.mode === 'receipts' ? 'Download the original receipt for each recorded payment.' : 'Review each fee below. Each Pay button pays only the exact amount shown for that fee.'}
            </DialogDescription>
          </DialogHeader>
          {feeDialog?.mode === 'receipts' ? (
            <ul className="divide-y divide-sgvu-navy/10">
              {dialogPayments.map((payment) => (
                <li key={payment.transaction_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-sgvu-navy">{feeHeadLabel(payment.fee_head)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(payment.created_at)} · {formatInr(payment.amount)}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">Reference: {payment.gateway_payment_id || payment.transaction_id}</p>
                  </div>
                  {payment.receipt_url?.trim() && payment.receipt_url.trim() !== '#' ? (
                    <Button size="sm" variant="outline" disabled={downloadingKey !== null}
                      aria-label={`Download receipt for ${feeHeadLabel(payment.fee_head)} on ${formatDate(payment.created_at)}`}
                      onClick={() => void downloadReceipt(payment)}>
                      {downloadingKey === payment.transaction_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Receipt
                    </Button>
                  ) : <span className="text-xs text-muted-foreground">Receipt unavailable</span>}
                </li>
              ))}
            </ul>
          ) : (
              <div className="space-y-3">
                {dialogRows.map((row) => {
                  const balance = outstanding(row);
                  const status = feeStatus(row, today);
                  const label = feeHeadLabel(row.fee_head);
                  return (
                    <article key={row.demand_id} aria-label={label} className="rounded-xl border border-sgvu-navy/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-semibold text-sgvu-navy">{label}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.semester ? `Semester ${row.semester}` : 'Not semester-specific'}{row.academic_year ? ` · ${row.academic_year}` : ''}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn('shrink-0 border-transparent', status.color)}>{status.label}</Badge>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Fee total</dt><dd className="mt-1 break-words font-semibold tabular-nums text-sgvu-navy">{formatInr(money(row.paid_amount) + balance)}</dd></div>
                        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Paid</dt><dd className="mt-1 break-words font-semibold tabular-nums text-emerald-700">{formatInr(row.paid_amount)}</dd></div>
                        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Left to pay</dt><dd className={cn('mt-1 break-words font-semibold tabular-nums', balance > 0 ? 'text-rose-700' : 'text-sgvu-navy')}>{formatInr(balance)}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Due date</dt><dd className="mt-1 font-semibold text-sgvu-navy">{formatDate(row.due_date)}</dd></div>
                      </dl>
                      {money(row.fee_concession) > 0 || waivedAmount(row) > 0 ? (
                        <details className="mt-3 text-xs text-muted-foreground">
                          <summary className="w-fit cursor-pointer rounded py-1 font-medium text-sgvu-navy focus-visible:outline-2">View scholarships & reductions</summary>
                          <dl className="mt-2 grid max-w-sm grid-cols-2 gap-x-4 gap-y-1.5">
                            <dt>Original fee</dt><dd className="text-right tabular-nums">{formatInr(row.amount)}</dd>
                            {money(row.scholarship) > 0 ? <><dt>Scholarship</dt><dd className="text-right tabular-nums">−{formatInr(row.scholarship)}</dd></> : null}
                            {money(row.discount) > 0 ? <><dt>Discount</dt><dd className="text-right tabular-nums">−{formatInr(row.discount)}</dd></> : null}
                            {money(row.credit) > 0 ? <><dt>Credit adjustment</dt><dd className="text-right tabular-nums">−{formatInr(row.credit)}</dd></> : null}
                            {waivedAmount(row) > 0 ? <><dt>Fee waiver</dt><dd className="text-right tabular-nums">−{formatInr(waivedAmount(row))}</dd></> : null}
                            <dt className="font-semibold">Total reductions</dt><dd className="text-right font-semibold tabular-nums">−{formatInr(money(row.fee_concession) + waivedAmount(row))}</dd>
                          </dl>
                        </details>
                      ) : null}
                      {balance > 0 ? (
                        <div className="mt-4 flex justify-end border-t border-sgvu-navy/10 pt-3">
                          <Button
                            size="sm" disabled={paying || !!checkout || !financeEnabled}
                            aria-label={`Pay ${formatInr(balance)} for ${label}`}
                            className="w-full bg-sgvu-navy text-white hover:bg-sgvu-navy/90 sm:w-auto"
                            onClick={() => void startPay(row.demand_id)}
                          >
                            {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                            Pay {formatInr(balance)}
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {!dialogRows.length ? <p className="py-4 text-sm text-muted-foreground">No fees assigned for this semester.</p> : null}
              </div>
          )}
        </DialogContent>
      </Dialog>
      {checkout ? (
        <RazorpayCheckout open order={checkout.order}
          studentName={user?.name ?? undefined} studentEmail={user?.email ?? undefined}
          onClose={() => setCheckout(null)} onSuccess={confirmPayment} />
      ) : null}
    </StudentPageShell>
  );
}
