'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type RegisterResponse } from '@/lib/api/api.campus-events';
import { RazorpayMockCheckout, type PaymentOrder } from '@/components/finance/RazorpayMockCheckout';

function formatCountdown(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function EventCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registrationId = searchParams.get('registrationId') ?? '';
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [hold, setHold] = useState<RegisterResponse | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [checkout, setCheckout] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const expiredRef = useRef(false);

  const loadHold = useCallback(async () => {
    if (!registrationId) return;
    const data = await eventsApi.getRegistration(registrationId);
    setHold(data);
    const serverOffset = data.server_now ? new Date(data.server_now).getTime() - Date.now() : 0;
    const expiresMs = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    const rem = data.expires_at
      ? Math.max(0, Math.floor((expiresMs - (Date.now() + serverOffset)) / 1000))
      : (data.remaining_seconds ?? 0);
    setRemaining(rem);
  }, [eventsApi, registrationId]);

  useEffect(() => {
    if (!registrationId) {
      router.replace('/student/events');
      return;
    }
    void loadHold()
      .catch(() => {
        toast.error('Could not load checkout session');
        router.replace('/student/events');
      })
      .finally(() => setLoading(false));
  }, [registrationId, loadHold, router]);

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
    if (remaining > 0 || !registrationId || expiredRef.current || loading) return;
    expiredRef.current = true;
    toast.error('Checkout expired. Please register again.');
    router.replace('/student/events');
  }, [remaining, registrationId, router, loading]);

  const countdownLabel = useMemo(() => formatCountdown(remaining), [remaining]);
  const urgent = remaining > 0 && remaining <= 30;
  const reg = hold?.registration;
  const eventId = reg?.event_id ?? '';

  function startPayment() {
    if (!hold?.order) {
      toast.error('Payment order not available');
      return;
    }
    setCheckout({
      order_id: hold.order.order_id,
      amount_inr: hold.order.amount_inr,
      fee_head: hold.order.fee_head,
      razorpay_key: hold.order.razorpay_key,
    });
  }

  async function confirmPayment(paymentId: string) {
    if (!registrationId || !eventId) return;
    await eventsApi.confirmPayment(eventId, registrationId, paymentId);
    toast.success('Ticket confirmed!');
    router.replace('/student/events');
  }

  if (loading || !hold || !reg) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
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
          <span className="text-sm text-muted-foreground">to complete payment</span>
        </div>
      </div>

      <StudentPageHeader
        title="Event checkout"
        description="Complete payment within 3 minutes to secure your pass."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{reg.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-muted-foreground">{reg.club_name}</p>
          {reg.venue ? <p>{reg.venue}</p> : null}
          <p className="font-semibold">₹{Number(reg.ticket_price ?? hold.order?.amount_inr ?? 0)}</p>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full bg-sgvu-navy" disabled={remaining <= 0} onClick={startPayment}>
        Pay Now
      </Button>

      <Button variant="ghost" className="w-full" onClick={() => router.push('/student/events')}>
        Back to events
      </Button>

      {checkout && (
        <RazorpayMockCheckout open order={checkout} onClose={() => setCheckout(null)} onSuccess={confirmPayment} />
      )}
    </div>
  );
}
