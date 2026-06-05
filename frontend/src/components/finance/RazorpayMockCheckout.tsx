'use client';

import { useState } from 'react';
import { IndianRupee, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type PaymentOrder = {
  order_id: string;
  amount_inr: number;
  fee_head: string;
  razorpay_key: string;
};

type Props = {
  order: PaymentOrder;
  open: boolean;
  onClose: () => void;
  onSuccess: (paymentId: string) => Promise<void>;
};

/**
 * Falcom-styled checkout shell — mimics Razorpay UX for QA without legacy styling.
 * Calls backend confirm after the student completes the dummy payment step.
 */
export function RazorpayMockCheckout({ order, open, onClose, onSuccess }: Props) {
  const [processing, setProcessing] = useState(false);

  if (!open) return null;

  async function pay() {
    setProcessing(true);
    try {
      const paymentId = `pay_${order.order_id}_${Date.now()}`;
      await onSuccess(paymentId);
      onClose();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sgvu-navy/40 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md border-sgvu-gold/30 shadow-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg text-sgvu-navy">Secure Checkout</CardTitle>
            <p className="text-xs text-muted-foreground">Powered by Razorpay · Sandbox</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-muted-foreground">{order.fee_head}</p>
            <p className="flex items-center gap-1 text-3xl font-black text-sgvu-navy">
              <IndianRupee className="h-7 w-7" />
              {order.amount_inr.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Order {order.order_id}</p>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            This is a demo payment — no real charge. UPI / Card / Netbanking simulated.
          </p>
          <Button
            className="w-full bg-[#3395ff] hover:bg-[#2a7fd9]"
            size="lg"
            disabled={processing}
            onClick={() => void pay()}
          >
            {processing ? 'Processing…' : 'Pay securely'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
