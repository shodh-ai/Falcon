'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { RazorpayMockCheckout, type PaymentOrder } from '@/components/finance/RazorpayMockCheckout';

type HoldDetail = {
  hold_id: string;
  bed_id: string;
  status: string;
  expires_at: string;
  server_now: string;
  remaining_seconds: number;
  lock_ttl_seconds: number;
  hostel_block: string;
  room_number: string;
  floor: string;
  bed_number: string;
  hostel_name: string | null;
};

function formatCountdown(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function HostelBookingCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const holdId = searchParams.get('holdId') ?? '';
  const api = useAuthedApi();
  const [hold, setHold] = useState<HoldDetail | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [checkout, setCheckout] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const expiredRef = useRef(false);

  const loadHold = useCallback(async () => {
    if (!holdId) return;
    const data = await api.get<HoldDetail>(`/api/hostel-tatkal/holds/${holdId}`);
    setHold(data);
    const serverOffset = new Date(data.server_now).getTime() - Date.now();
    const expiresMs = new Date(data.expires_at).getTime();
    const rem = Math.max(0, Math.floor((expiresMs - (Date.now() + serverOffset)) / 1000));
    setRemaining(rem);
  }, [api, holdId]);

  useEffect(() => {
    if (!holdId) {
      router.replace('/student/hostel-booking');
      return;
    }
    void loadHold()
      .catch(() => {
        toast.error('Could not load checkout session');
        router.replace('/student/hostel-booking');
      })
      .finally(() => setLoading(false));
  }, [holdId, loadHold, router]);

  useEffect(() => {
    if (!hold || expiredRef.current) return;
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [hold]);

  useEffect(() => {
    if (remaining > 0 || !holdId || expiredRef.current || loading) return;

    expiredRef.current = true;
    void (async () => {
      try {
        await api.post(`/api/hostel-tatkal/holds/${holdId}/release`, {});
      } catch {
        /* ignore */
      }
      toast.error('Session expired. Your bed has been released.');
      router.replace('/student/hostel-booking');
    })();
  }, [remaining, holdId, api, router, loading]);

  const countdownLabel = useMemo(() => formatCountdown(remaining), [remaining]);
  const urgent = remaining > 0 && remaining <= 30;

  async function startPayment() {
    if (!holdId) return;
    try {
      const order = await api.post<PaymentOrder & { amount_inr: number; fee_head: string }>(
        `/api/hostel-tatkal/holds/${holdId}/pay/order`,
        {},
      );
      setCheckout({
        order_id: order.order_id,
        amount_inr: order.amount_inr,
        fee_head: order.fee_head,
        razorpay_key: order.razorpay_key,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start payment');
    }
  }

  async function confirmPayment(paymentId: string) {
    if (!holdId) return;
    await api.post('/api/hostel-tatkal/confirm-payment', {
      hold_id: holdId,
      payment_ref: paymentId,
    });
    toast.success('Room booked — allocation confirmed!');
    router.replace('/student/hostel');
  }

  if (loading || !hold) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  if (hold.status === 'CONFIRMED') {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-lg font-semibold text-sgvu-navy">Booking confirmed</p>
        <Button asChild className="bg-sgvu-navy">
          <a href="/student/hostel">Go to my hostel</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
      <div
        className={`sticky top-0 z-10 -mx-4 border-b px-4 py-3 md:-mx-6 md:px-6 ${
          urgent ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
        }`}
      >
        <div className="flex items-center justify-center gap-2 text-center">
          <Clock className={`h-5 w-5 ${urgent ? 'text-red-700' : 'text-amber-800'}`} />
          <span className={`text-lg font-black tabular-nums ${urgent ? 'text-red-800' : 'text-amber-900'}`}>
            {countdownLabel}
          </span>
          <span className="text-sm text-muted-foreground">remaining to complete payment</span>
        </div>
      </div>

      <StudentPageHeader
        title="Complete your booking"
        description="Pay now to secure this bed. If the timer ends, the bed is released for other students."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Hostel</span>{' '}
            <strong>{hold.hostel_name ?? hold.hostel_block}</strong>
          </p>
          <p>
            <span className="text-muted-foreground">Location</span>{' '}
            <strong>
              {hold.floor} · Room {hold.room_number} · Bed {hold.bed_number}
            </strong>
          </p>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full bg-sgvu-navy" disabled={remaining <= 0} onClick={() => void startPayment()}>
        Pay Now
      </Button>

      <Button variant="ghost" className="w-full" onClick={() => router.push('/student/hostel-booking')}>
        Back to bed map
      </Button>

      {checkout && (
        <RazorpayMockCheckout
          open
          order={checkout}
          onClose={() => setCheckout(null)}
          onSuccess={confirmPayment}
        />
      )}
    </div>
  );
}
