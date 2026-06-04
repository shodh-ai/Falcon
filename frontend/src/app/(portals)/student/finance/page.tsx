'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, IndianRupee, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { formatInr } from '@/components/finance/FinancePageHeader';

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
};

export default function StudentFinancePage() {
  const api = useAuthedApi();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(() => {
    void api.get<Ledger>('/api/student/finance').then(setLedger);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function payNow(demandId: string) {
    setPayingId(demandId);
    try {
      const res = await api.post<{ message: string; receipt_url?: string }>('/api/student/finance/pay', {
        demand_id: demandId,
      });
      toast.success(res.message ?? 'Payment successful');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPayingId(null);
    }
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <StudentPageHeader
        title="My Financial Ledger"
        description="View pending fee demands, pay online, and download payment receipts."
      />

      {ledger && ledger.total_outstanding > 0 && (
        <Card className="border-amber-300 bg-amber-50/80">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-sgvu-gold" />
              <div>
                <p className="text-sm font-medium text-amber-900">Total outstanding</p>
                <p className="text-3xl font-black text-sgvu-navy">
                  {formatInr(ledger.total_outstanding)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending fee demands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(ledger?.pending_demands ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No pending fees — you&apos;re all clear.</p>
          )}
          {(ledger?.pending_demands ?? []).map((d) => {
            const due = outstanding(d);
            return (
              <div
                key={d.demand_id}
                className="flex flex-col gap-4 rounded-xl border border-sgvu-gold/30 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-lg font-bold text-sgvu-navy">{d.fee_head}</p>
                  <p className="text-sm text-muted-foreground">
                    {d.academic_year}
                    {d.semester != null ? ` · Semester ${d.semester}` : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant={d.status === 'OVERDUE' ? 'destructive' : 'secondary'}>{d.status}</Badge>
                    <span className="text-sm">
                      Due <strong>{new Date(d.due_date).toLocaleDateString('en-IN')}</strong>
                    </span>
                  </div>
                  <p className="flex items-center gap-1 text-2xl font-black text-sgvu-navy">
                    <IndianRupee className="h-6 w-6" />
                    {due.toLocaleString('en-IN')}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full shrink-0 bg-sgvu-navy sm:w-auto"
                  disabled={payingId === d.demand_id || due <= 0}
                  onClick={() => void payNow(d.demand_id)}
                >
                  {payingId === d.demand_id ? 'Processing…' : 'Pay Now'}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Fee head</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {(ledger?.payment_history ?? []).map((row) => (
                <tr key={row.transaction_id} className="border-b">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3 pr-4">{row.fee_head ?? '—'}</td>
                  <td className="py-3 pr-4 font-semibold">{formatInr(row.amount)}</td>
                  <td className="py-3 pr-4">{row.payment_mode ?? '—'}</td>
                  <td className="py-3">
                    <Button size="sm" variant="outline" onClick={() => downloadReceipt(row)}>
                      <Download className="mr-1 h-4 w-4" />
                      Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ledger?.payment_history?.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
