'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, IndianRupee, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentOrder = {
  order_id: string;
  amount_inr: number;
  fee_head: string;
  razorpay_key: string;
};

type RazorpayCheckoutProps = {
  open: boolean;
  order: PaymentOrder;
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string;
  onClose: () => void;
  onSuccess: (paymentId: string) => Promise<void>;
};

// ─── Script Loader ───────────────────────────────────────────────────────────

let razorpayScriptStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';

function loadRazorpayScript(): Promise<boolean> {
  if (razorpayScriptStatus === 'loaded') return Promise.resolve(true);
  if (razorpayScriptStatus === 'loading') {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (razorpayScriptStatus === 'loaded') { clearInterval(check); resolve(true); }
        if (razorpayScriptStatus === 'error') { clearInterval(check); resolve(false); }
      }, 100);
    });
  }
  razorpayScriptStatus = 'loading';
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => { razorpayScriptStatus = 'loaded'; resolve(true); };
    script.onerror = () => { razorpayScriptStatus = 'error'; resolve(false); };
    document.body.appendChild(script);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Structured Razorpay checkout wrapper.
 *
 * When a real Razorpay key is provided (not starting with "sandbox_"), it will
 * attempt to load the official Razorpay script and open the native overlay.
 *
 * For sandbox / demo keys (or when the script fails to load), it renders a
 * branded mock checkout dialog that simulates the payment flow.
 */
export function RazorpayCheckout({
  open,
  order,
  studentName,
  studentEmail,
  studentPhone,
  onClose,
  onSuccess,
}: RazorpayCheckoutProps) {
  const [processing, setProcessing] = useState(false);
  const [mode, setMode] = useState<'loading' | 'native' | 'sandbox' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  const isSandboxKey = !order.razorpay_key || order.razorpay_key.startsWith('sandbox_');

  const openNativeCheckout = useCallback(() => {
    const Razorpay = (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
    if (!Razorpay) {
      setErrorMessage('Payment gateway script failed to initialize. Close and try again.');
      setMode('error');
      return;
    }

    const options = {
      key: order.razorpay_key,
      amount: order.amount_inr * 100,
      currency: 'INR',
      name: 'SGVU — Fee Payment',
      description: order.fee_head.replace(/_/g, ' '),
      order_id: order.order_id,
      prefill: {
        name: studentName ?? '',
        email: studentEmail ?? '',
        contact: studentPhone ?? '',
      },
      handler: async (response: { razorpay_payment_id: string }) => {
        setProcessing(true);
        try { await onSuccess(response.razorpay_payment_id); }
        finally { setProcessing(false); }
      },
      modal: { ondismiss: onClose },
      theme: { color: '#0f172a' },
    };

    const rzpInstance = new Razorpay(options);
    rzpInstance.open();
  }, [order, studentName, studentEmail, studentPhone, onSuccess, onClose]);

  useEffect(() => {
    if (!open || attempted.current) return;
    attempted.current = true;

    if (isSandboxKey) {
      setMode('sandbox');
      return;
    }

    void loadRazorpayScript().then((loaded) => {
      if (loaded) {
        setMode('native');
        openNativeCheckout();
      } else {
        // Never fall back to sandbox when a live key was issued — that would forge pay_sandbox_* ids.
        setErrorMessage(
          'Could not load the payment gateway. Check your network, then close and try again.',
        );
        setMode('error');
      }
    });
  }, [open, isSandboxKey, openNativeCheckout]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      attempted.current = false;
      setMode('loading');
      setErrorMessage(null);
    }
  }, [open]);

  if (!open) return null;

  // ── Native mode: Razorpay overlay is open, show nothing extra ──
  if (mode === 'native') return null;

  // ── Loading ──
  if (mode === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-sgvu-navy/40 p-4 backdrop-blur-sm">
        <Card className="w-full max-w-md shadow-2xl">
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
            <span className="text-sm text-muted-foreground">Connecting to payment gateway…</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-sgvu-navy/40 p-4 backdrop-blur-sm">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-lg text-sgvu-navy">Payment unavailable</CardTitle>
            <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? 'Could not start checkout.'}
            </p>
            <Button type="button" className="w-full bg-sgvu-navy" onClick={onClose}>
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Sandbox (only when backend issued a sandbox_* key via ALLOW_MOCK_PAYMENTS) ──
  async function sandboxPay() {
    setProcessing(true);
    try {
      const paymentId = `pay_sandbox_${order.order_id}_${Date.now()}`;
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
            <p className="text-xs text-muted-foreground">Powered by Razorpay</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">Sandbox</Badge>
            <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Order summary */}
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-muted-foreground">{order.fee_head.replace(/_/g, ' ')}</p>
            <p className="flex items-center gap-1 text-3xl font-black text-sgvu-navy">
              <IndianRupee className="h-7 w-7" />
              {order.amount_inr.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Order {order.order_id}</p>
          </div>

          {/* Payment method selector (visual only in sandbox) */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment method</p>
            <div className="grid grid-cols-3 gap-2">
              {['UPI', 'Card', 'Netbanking'].map((m) => (
                <div
                  key={m}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2.5 text-xs font-medium hover:border-sgvu-navy/40 hover:bg-slate-50"
                >
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  {m}
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Sandbox mode — no real charge will be made. Connect a live Razorpay key to enable production payments.
          </p>

          <Button
            className="w-full bg-[#3395ff] hover:bg-[#2a7fd9]"
            size="lg"
            disabled={processing}
            onClick={() => void sandboxPay()}
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              'Pay securely'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
