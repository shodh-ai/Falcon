'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  createCertificateAutomationApi,
  type CertApplication,
  type CertEvent,
} from '@/lib/api/api.certificate-automation';
import { RazorpayCheckout, type PaymentOrder } from '@/components/finance/RazorpayCheckout';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';

function formatInr(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function DegreeConvocationPanel() {
  const api = useAuthedApi();
  const certApi = useMemo(() => createCertificateAutomationApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [event, setEvent] = useState<CertEvent | null>(null);
  const [applications, setApplications] = useState<CertApplication[]>([]);
  const [checkout, setCheckout] = useState<{ demandId: string; order: PaymentOrder } | null>(null);

  const load = useCallback(async () => {
    const [ev, mine] = await Promise.all([certApi.activeEvent(), certApi.myApplications()]);
    setEvent(ev);
    setApplications(mine);
  }, [certApi]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function startPay(demandId: string) {
    if (!isLaunchModuleEnabled('finance')) {
      toast.error('Online fee payment is not available yet. Contact the Registrar office.');
      return;
    }
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
    await api.post('/api/student/finance/pay', {
      demand_id: checkout.demandId,
      payment_id: paymentId,
    });
    toast.success('Payment successful — application submitted for verification');
    setCheckout(null);
    await load();
  }

  async function applyForDegree() {
    if (!event) return;
    setApplying(true);
    try {
      const res = await certApi.apply(event.event_id);
      if (res.finance_demand_id) {
        if (isLaunchModuleEnabled('finance')) {
          toast.info('Complete payment to submit your degree application');
          await startPay(res.finance_demand_id);
        } else {
          toast.info('Application recorded — pay the degree fee at the Registrar office when finance goes live.');
        }
      } else {
        toast.success('Application recorded');
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Application failed');
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <StudentLoadingState label="Loading certificate services…" />;

  const pendingPayment = applications.find((a) => a.verification_status === 'PAYMENT_PENDING');

  return (
    <div className="space-y-6">
      <Card className="border-sgvu-gold/30">
        <CardHeader>
          <CardTitle className="text-sgvu-navy">
            {event ? event.event_name : 'No convocation window open'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {event ? (
            <>
              <p className="text-sm text-muted-foreground">
                Application window: {new Date(event.application_start_date).toLocaleDateString('en-IN')} –{' '}
                {new Date(event.application_end_date).toLocaleDateString('en-IN')}
              </p>
              <p className="text-lg font-bold text-sgvu-navy">Degree fee: {formatInr(event.base_fee)}</p>
              {!applications.some((a) => a.verification_status !== 'PAYMENT_PENDING') && (
                <Button onClick={() => void applyForDegree()} disabled={applying}>
                  {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply for Degree
                </Button>
              )}
              {pendingPayment?.finance_demand_id && isLaunchModuleEnabled('finance') && (
                <Button variant="outline" onClick={() => void startPay(pendingPayment.finance_demand_id!)}>
                  Complete Payment ({formatInr(pendingPayment.total_amount ?? event.base_fee)})
                </Button>
              )}
            </>
          ) : (
            <StudentEmptyState
              title="Applications closed"
              description="The Registrar will announce the next convocation window on the Notice Board."
            />
          )}
        </CardContent>
      </Card>

      {applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My Applications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {applications.map((app) => (
              <div key={app.application_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-semibold text-sgvu-navy">{app.event_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Applied {new Date(app.applied_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <Badge
                  variant={
                    app.verification_status === 'VERIFIED'
                      ? 'default'
                      : app.verification_status === 'REJECTED'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {app.verification_status.replace(/_/g, ' ')}
                </Badge>
                {app.certificate_generated && app.certificate_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={app.certificate_url} target="_blank" rel="noreferrer">
                      Download Certificate
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {checkout && (
        <RazorpayCheckout
          open
          order={checkout.order}
          onClose={() => setCheckout(null)}
          onSuccess={confirmPayment}
        />
      )}
    </div>
  );
}
