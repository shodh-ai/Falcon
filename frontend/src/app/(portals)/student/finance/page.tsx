'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, IndianRupee, Lock, Unlock, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { formatInr } from '@/components/finance/FinancePageHeader';
import { RazorpayMockCheckout, type PaymentOrder } from '@/components/finance/RazorpayMockCheckout';

type FeeDemand = {
  demand_id: string;
  fee_head: string;
  academic_year: string;
  semester: number | null;
  total_amount: string;
  paid_amount: string;
  due_date: string;
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
};

type Ledger = {
  pending_demands: FeeDemand[];
  payment_history: PaymentRow[];
  total_outstanding: number;
  gates: {
    admit_card_locked: boolean;
    no_dues_blocked: boolean;
    hostel_fines_pending: number;
    message: string;
  };
};

export default function StudentFinancePage() {
  const api = useAuthedApi();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [checkout, setCheckout] = useState<{ order: PaymentOrder; demandId: string } | null>(null);

  const load = useCallback(() => {
    void api.get<Ledger>('/api/student/finance').then(setLedger);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function startPay(demandId: string) {
    try {
      const order = await api.post<PaymentOrder & { demand_id: string }>('/api/student/finance/pay/order', {
        demand_id: demandId,
      });
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
    }
  }

  async function confirmPayment(paymentId: string) {
    if (!checkout) return;
    const res = await api.post<{ message: string; gates: Ledger['gates'] }>('/api/student/finance/pay', {
      demand_id: checkout.demandId,
      payment_id: paymentId,
    });
    toast.success(res.message ?? 'Payment successful');
    if (res.gates && !res.gates.admit_card_locked) {
      toast.success('Admit card & no-dues unlocked');
    }
    setCheckout(null);
    load();
  }

  function downloadReceipt(row: PaymentRow) {
    if (row.receipt_url) {
      window.open(row.receipt_url, '_blank');
      return;
    }
    toast.info('Receipt will be available once finance generates the PDF');
  }

  const outstanding = (d: FeeDemand) =>
    Math.max(0, Number(d.total_amount) - Number(d.paid_amount ?? 0));

  const locked = ledger?.gates?.admit_card_locked ?? false;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="My Financial Ledger"
        description="Pay hostel fines, tuition, and other demands via secure Razorpay checkout."
      />

      <Card className={locked ? 'border-amber-300 bg-amber-50/60 shadow-md' : 'border-emerald-300 bg-emerald-50/40 shadow-md'}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          {locked ? (
            <Lock className="h-10 w-10 text-amber-700" />
          ) : (
            <Unlock className="h-10 w-10 text-emerald-700" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-sgvu-navy">
              {locked ? 'Admit card & no-dues locked' : 'Admit card & no-dues unlocked'}
            </p>
            <p className="text-sm text-muted-foreground">{ledger?.gates?.message}</p>
            {(ledger?.gates?.hostel_fines_pending ?? 0) > 0 && (
              <p className="mt-1 text-sm text-amber-800">
                {ledger?.gates?.hostel_fines_pending} hostel damage fine(s) pending payment.
              </p>
            )}
          </div>
          {locked && (
            <Button asChild variant="outline" size="sm">
              <Link href="/student/exams">Exam desk</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {ledger && ledger.total_outstanding > 0 && (
        <StudentStatCard
          label="Total outstanding"
          value={formatInr(ledger.total_outstanding)}
          helper="Across all pending fee demands"
          icon={Wallet}
          tone="warning"
        />
      )}

      <StudentSectionCard title="Pending fee demands" description="Pay online to unlock admit card and no-dues" icon={IndianRupee} tone="gold">
          {(ledger?.pending_demands ?? []).length === 0 && (
            <StudentEmptyState title="All clear" description="No pending fees — you're up to date." />
          )}
          {(ledger?.pending_demands ?? []).map((d) => {
            const due = outstanding(d);
            const isHostelFine = d.fee_head === 'HOSTEL_DAMAGE';
            return (
              <div
                key={d.demand_id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-sgvu-navy">{d.fee_head.replace(/_/g, ' ')}</p>
                    {isHostelFine && <Badge variant="secondary">Hostel</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {d.academic_year}
                    {d.semester != null ? ` · Sem ${d.semester}` : ''}
                  </p>
                  <Badge variant={d.status === 'OVERDUE' ? 'destructive' : 'outline'}>{d.status}</Badge>
                  <p className="flex items-center gap-1 text-2xl font-black text-sgvu-navy">
                    <IndianRupee className="h-6 w-6" />
                    {due.toLocaleString('en-IN')}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full bg-sgvu-navy sm:w-auto"
                  disabled={due <= 0}
                  onClick={() => void startPay(d.demand_id)}
                >
                  Pay Now
                </Button>
              </div>
            );
          })}
      </StudentSectionCard>

      <StudentSectionCard title="Payment history" description="Past transactions and receipt downloads" icon={Download}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Fee head</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {(ledger?.payment_history ?? []).map((row) => (
                <tr key={row.transaction_id} className="border-b">
                  <td className="py-3 pr-4">{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="py-3 pr-4">{row.fee_head ?? '—'}</td>
                  <td className="py-3 pr-4 font-semibold">{formatInr(row.amount)}</td>
                  <td className="py-3">
                    <Button size="sm" variant="outline" onClick={() => downloadReceipt(row)}>
                      <Download className="mr-1 h-4 w-4" />
                      Receipt
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
      </StudentSectionCard>

      {checkout && (
        <RazorpayMockCheckout
          open
          order={checkout.order}
          onClose={() => setCheckout(null)}
          onSuccess={confirmPayment}
        />
      )}
    </StudentPageShell>
  );
}
