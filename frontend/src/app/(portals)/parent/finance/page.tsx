'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Download, IndianRupee, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useParentChild } from '@/context/ParentChildContext';
import { RazorpayCheckout, type PaymentOrder } from '@/components/finance/RazorpayCheckout';
import { ParentPageHeader } from '@/components/parent/ParentPageHeader';

type Fee = {
  demand_id: string;
  fee_head: string;
  academic_year: string;
  semester: number;
  total_amount: string;
  paid_amount: string;
  due_date: string;
  status: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ParentFinancePage() {
  const api = useAuthedApi();
  const { selectedChildId, selectedChild, loading: childLoading } = useParentChild();
  const [checkout, setCheckout] = useState<{ demandId: string; order: PaymentOrder } | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  const { data: fees = [], isLoading, mutate } = useSWR<Fee[]>(
    selectedChildId ? ['parent-fees', selectedChildId] : null,
    () => api.get<Fee[]>(`/api/parent/students/${selectedChildId}/fees`),
    { revalidateOnFocus: true },
  );

  async function startPayment(demandId: string) {
    if (!selectedChildId) return;
    try {
      const order = await api.post<PaymentOrder & { demand_id: string }>(
        `/api/parent/students/${selectedChildId}/payments/order`,
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
      toast.error(e instanceof Error ? e.message : 'Could not start payment');
    }
  }

  async function confirmPayment(paymentId: string) {
    if (!selectedChildId || !checkout) return;
    await api.post(`/api/parent/students/${selectedChildId}/payments/confirm`, {
      demand_id: checkout.demandId,
      payment_id: paymentId,
    });
    toast.success('Payment recorded successfully');
    setCheckout(null);
    await mutate();
  }

  async function downloadCertificate() {
    if (!selectedChildId) return;
    setCertLoading(true);
    try {
      const res = await api.get<{ download_url: string; total_paid: number; financial_year: string }>(
        `/api/parent/students/${selectedChildId}/fee-certificate`,
      );
      window.open(`${API_URL}${res.download_url}`, '_blank');
      toast.success(`Certificate generated — ₹${res.total_paid.toLocaleString('en-IN')} for FY ${res.financial_year}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Certificate generation failed');
    } finally {
      setCertLoading(false);
    }
  }

  if (childLoading || isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  const pending = fees.filter((f) => f.status !== 'PAID');
  const totalDue = pending.reduce(
    (sum, f) => sum + Math.max(0, Number(f.total_amount) - Number(f.paid_amount ?? 0)),
    0,
  );

  return (
    <div className="space-y-6">
      <ParentPageHeader
        title="Finance & Tax Hub"
        description="Pay dues securely and download annual fee certificates for Section 80C."
        actions={
          <Button
            variant="outline"
            disabled={certLoading}
            onClick={() => void downloadCertificate()}
          >
            {certLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            80C Certificate
          </Button>
        }
      />

      <Card className="border-sgvu-gold/40 bg-gradient-to-br from-amber-50/60 to-white">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total due</p>
            <p className="text-3xl font-black text-sgvu-navy">
              <IndianRupee className="mr-1 inline h-6 w-6" />
              {totalDue.toLocaleString('en-IN')}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        {fees.map((fee) => {
          const due = Math.max(0, Number(fee.total_amount) - Number(fee.paid_amount ?? 0));
          const isPaid = fee.status === 'PAID' || due <= 0;
          return (
            <Card key={fee.demand_id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{fee.fee_head}</CardTitle>
                  <Badge variant={isPaid ? 'success' : 'secondary'}>{isPaid ? 'Paid' : 'Due'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-black text-sgvu-navy">₹{due.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">
                  {fee.academic_year} · Sem {fee.semester} · Due {new Date(fee.due_date).toLocaleDateString('en-IN')}
                </p>
                {!isPaid ? (
                  <Button
                    className="w-full bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90"
                    onClick={() => void startPayment(fee.demand_id)}
                  >
                    Pay with UPI / Razorpay
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Download Annual Fee Certificate for Income Tax Section 80C documentation.
      </p>

      {checkout ? (
        <RazorpayCheckout
          open
          order={checkout.order}
          studentName={selectedChild?.name}
          onClose={() => setCheckout(null)}
          onSuccess={confirmPayment}
        />
      ) : null}
    </div>
  );
}
