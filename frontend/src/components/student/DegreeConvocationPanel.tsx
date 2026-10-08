'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Download,
  GraduationCap,
  Loader2,
  IndianRupee,
  FileBadge2,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

function formatInr(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Hide internal seed/scenario tags from student-facing titles. */
function displayEventName(name: string) {
  return (
    name
      .replace(/\s*[—–―-]\s*F\.?\s*3\s*Simulation\s*/gi, ' ')
      .replace(/\s*F\.?\s*3\s*Simulation\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() || name
  );
}

export function DegreeConvocationPanel() {
  const api = useAuthedApi();
  const certApi = useMemo(() => createCertificateAutomationApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [event, setEvent] = useState<CertEvent | null>(null);
  const [applications, setApplications] = useState<CertApplication[]>([]);
  const [checkout, setCheckout] = useState<{ demandId: string; order: PaymentOrder } | null>(null);
  const financeEnabled = isLaunchModuleEnabled('finance');

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const [evResult, mineResult] = await Promise.allSettled([
        certApi.activeEvent(),
        certApi.myApplications(),
      ]);

      const eventFailed = evResult.status === 'rejected';
      const appsFailed = mineResult.status === 'rejected';

      if (eventFailed && appsFailed) {
        setLoadError(
          evResult.reason instanceof Error
            ? evResult.reason.message
            : 'Could not load certificate services',
        );
        return false;
      }

      if (evResult.status === 'fulfilled') setEvent(evResult.value);
      else setEvent(null);

      if (mineResult.status === 'fulfilled') {
        setApplications(Array.isArray(mineResult.value) ? mineResult.value : []);
      } else {
        setApplications([]);
      }

      setLoadError(null);
      if (eventFailed || appsFailed) {
        toast.error(
          eventFailed
            ? 'Could not load the active convocation window'
            : 'Could not load your degree applications',
        );
      }
      return true;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load certificate services');
      return false;
    }
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
    try {
      await api.post('/api/student/finance/pay', {
        demand_id: checkout.demandId,
        payment_id: paymentId,
      });
      toast.success('Payment successful — application submitted for verification');
      setCheckout(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment confirmation failed');
    }
  }

  async function applyForDegree() {
    if (!event) return;
    setApplying(true);
    try {
      const eventId = event.event_id;
      if (!eventId) {
        toast.error('Convocation event is missing an ID. Contact the Registrar.');
        return;
      }
      const res = await certApi.apply(eventId);
      await load();
      toast.success('Degree application submitted', {
        description: res.finance_demand_id
          ? 'Your application is on file. Complete the fee to send it for registrar verification.'
          : 'Your application is on file and pending registrar verification.',
        category: 'ACADEMICS',
      });
      if (res.finance_demand_id && isLaunchModuleEnabled('finance')) {
        try {
          await startPay(res.finance_demand_id);
        } catch {
          // Application already saved; payment can be completed from the button below.
        }
      } else if (res.finance_demand_id && !isLaunchModuleEnabled('finance')) {
        toast.info('Pay the degree fee at the Registrar / Accounts office to continue verification.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Application failed', {
        category: 'ACADEMICS',
      });
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <StudentLoadingState label="Loading certificate services…" />;

  if (loadError) {
    return (
      <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-sgvu-navy">Certificate services unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            className="bg-[#0B2447] text-white hover:bg-[#123A6D]"
            onClick={() => {
              setLoading(true);
              void load().finally(() => setLoading(false));
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const currentApplication = event
    ? applications.find((a) => a.event_id === event.event_id) ?? null
    : null;
  const pendingPayment =
    currentApplication?.verification_status === 'PAYMENT_PENDING'
      ? currentApplication
      : null;
  const hasApplicationForEvent = Boolean(currentApplication);
  const canApply = Boolean(event) && !hasApplicationForEvent;
  const eventTitle = event ? displayEventName(event.event_name) : null;
  const currentStatusLabel = !currentApplication
    ? 'Not applied yet'
    : currentApplication.verification_status === 'PAYMENT_PENDING'
      ? 'Applied — fee pending'
      : currentApplication.verification_status === 'PENDING_VERIFICATION'
        ? 'Applied — under review'
        : currentApplication.verification_status.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/8 bg-white pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Degree & convocation
                </p>
                <CardTitle className="mt-1 text-xl text-sgvu-navy">
                  {eventTitle ?? 'No convocation window open'}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {event
                    ? 'Apply for your degree certificate during the open window. Fee payment confirms submission.'
                    : 'The Registrar will announce the next window on the Notice Board.'}
                </p>
              </div>
            </div>
            {event ? (
              <Badge className="w-fit shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                Window open
              </Badge>
            ) : (
              <Badge variant="outline" className="w-fit shrink-0 text-muted-foreground">
                Closed
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {event ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <CalendarRange className="h-3.5 w-3.5 text-sgvu-navy" />
                    Application window
                  </div>
                  <p className="mt-2 text-sm font-bold text-sgvu-navy">
                    {formatDate(event.application_start_date)} – {formatDate(event.application_end_date)}
                  </p>
                </div>

                <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <IndianRupee className="h-3.5 w-3.5 text-sgvu-navy" />
                    Degree fee
                  </div>
                  <p className="mt-2 text-2xl font-black tracking-tight text-sgvu-navy">
                    {formatInr(event.base_fee)}
                  </p>
                </div>

                <div className="rounded-2xl border border-sgvu-navy/10 bg-white p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    <FileBadge2 className="h-3.5 w-3.5 text-sgvu-navy" />
                    Your status
                  </div>
                  <p className="mt-2 text-sm font-bold text-sgvu-navy">{currentStatusLabel}</p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-sgvu-navy/10 bg-white px-4 py-6">
                <p className="max-w-lg text-center text-sm text-muted-foreground">
                  {canApply
                    ? `Ready to apply? Submit your degree request for ${eventTitle}.`
                    : pendingPayment
                      ? financeEnabled
                        ? 'Your degree application is saved. Complete the fee to send it for verification.'
                        : 'Your degree application is saved. Pay the degree fee at the Registrar / Accounts office to continue verification.'
                      : 'Your degree application is on file for this convocation cycle.'}
                </p>
                <div className="flex w-full max-w-md flex-col items-center gap-2">
                  {canApply ? (
                    <Button
                      type="button"
                      onClick={() => void applyForDegree()}
                      disabled={applying}
                      className="w-full bg-[#0B2447] px-8 text-white shadow-md hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy disabled:bg-[#0B2447] disabled:text-white disabled:opacity-60 sm:w-auto sm:min-w-[14rem]"
                    >
                      {applying ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <GraduationCap className="mr-2 h-4 w-4" />
                      )}
                      {applying ? 'Submitting…' : 'Apply for Degree'}
                    </Button>
                  ) : null}
                  {pendingPayment?.finance_demand_id && financeEnabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void startPay(pendingPayment.finance_demand_id!)}
                      className="w-full border-sgvu-navy/20 bg-white text-sgvu-navy hover:bg-sgvu-gold/15 active:bg-sgvu-gold active:text-sgvu-navy sm:w-auto sm:min-w-[14rem]"
                    >
                      Complete Payment ({formatInr(pendingPayment.total_amount ?? event.base_fee)})
                    </Button>
                  ) : null}
                  {pendingPayment && !financeEnabled ? (
                    <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs text-amber-950">
                      Online payment is unavailable. Visit the Registrar / Accounts counter with
                      demand reference{' '}
                      <span className="font-mono font-semibold">
                        {pendingPayment.finance_demand_id ?? pendingPayment.application_id}
                      </span>{' '}
                      and pay {formatInr(pendingPayment.total_amount ?? event.base_fee)}.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <StudentEmptyState
              title="Applications closed"
              description="The Registrar will announce the next convocation window on the Notice Board."
            />
          )}
        </CardContent>
      </Card>

      {applications.length > 0 ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="border-b border-sgvu-navy/8 bg-white pb-4">
            <CardTitle className="text-base text-sgvu-navy">My applications</CardTitle>
            <p className="text-xs text-muted-foreground">Track verification and download certificates when ready.</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {applications.map((app) => (
              <div
                key={app.application_id}
                className="flex flex-col gap-3 rounded-2xl border border-sgvu-navy/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sgvu-navy">
                    {displayEventName(app.event_name ?? 'Convocation')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Applied {formatDate(app.applied_at)}
                    {app.total_amount != null ? ` · Fee ${formatInr(app.total_amount)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      app.verification_status === 'VERIFIED'
                        ? 'success'
                        : app.verification_status === 'REJECTED'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className={cn(
                      app.verification_status === 'PAYMENT_PENDING' && 'bg-amber-100 text-amber-800',
                    )}
                  >
                    {app.verification_status.replace(/_/g, ' ')}
                  </Badge>
                  {app.certificate_generated && app.certificate_url ? (
                    <Button size="sm" variant="outline" className="border-sgvu-navy/20" asChild>
                      <a href={app.certificate_url} target="_blank" rel="noreferrer">
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Download Certificate
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {checkout ? (
        <RazorpayCheckout
          open
          order={checkout.order}
          onClose={() => setCheckout(null)}
          onSuccess={confirmPayment}
        />
      ) : null}
    </div>
  );
}
