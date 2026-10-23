'use client';

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Loader2, Send } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import { isEmptyArray, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoPayslips } from '@/lib/mock/faculty-portal-demo';
import { SelfServiceLoadError } from './SelfServiceLoadError';

type PublishedMonth = {
  payslip_id: string;
  month: string;
  year: number;
  net_pay: string | number;
  gross_pay?: string | number;
  period_key: string;
};

type DownloadRequest = {
  request_id: string;
  period_from: string | null;
  period_to: string | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewer_remarks?: string | null;
  created_at: string;
};

function formatMonthKey(key: string) {
  const [y, m] = key.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function statusBadge(status: DownloadRequest['status']) {
  if (status === 'APPROVED') return <Badge className="bg-emerald-600">HR approved — download payslips</Badge>;
  if (status === 'PENDING') return <Badge variant="secondary">Pending HR approval</Badge>;
  return <Badge variant="destructive">Rejected</Badge>;
}

export function MyPayslipsPanel() {
  const { user, token } = useAuth();
  return <PayslipsWorkspace key={`${user?.user_id ?? ''}:${token ?? ''}`} />;
}

function PayslipsWorkspace() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const pathname = usePathname();
  const facultySmoke = pathname?.startsWith('/faculty');
  const [published, setPublished] = useState<PublishedMonth[]>([]);
  const [requests, setRequests] = useState<DownloadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const alive = useRef(false);
  const activeApi = useRef(api);
  useLayoutEffect(() => { activeApi.current = api; }, [api]);
  const requestId = useRef(0);
  const actionLock = useRef(false);
  const current = useCallback(() => alive.current && activeApi.current === api, [api]);

  const bounds = useMemo(() => {
    if (!published.length) return null;
    const keys = published.map((p) => p.period_key).sort();
    return { min: keys[0], max: keys[keys.length - 1] };
  }, [published]);

  const monthsInSelection = useMemo(() => {
    if (!periodFrom || !periodTo || !published.length) return 0;
    const keys = new Set(published.map((p) => p.period_key));
    const from = periodFrom;
    const to = periodTo;
    if (from > to) return 0;
    let count = 0;
    let cur = from;
    while (cur <= to) {
      if (keys.has(cur)) count += 1;
      const [y, m] = cur.split('-').map(Number);
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      cur = `${nextY}-${String(nextM).padStart(2, '0')}`;
    }
    return count;
  }, [periodFrom, periodTo, published]);

  const load = useCallback(async (afterSave = false) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const [monthsResult, requestsResult] = await Promise.allSettled([
      api.get<PublishedMonth[]>('/api/hr/payslips/my-payslips').then((rows) => { if (!Array.isArray(rows)) throw new Error('Invalid published payslips response'); return rows; }),
      api.get<DownloadRequest[]>('/api/hr/payslips/download-requests/mine').then((rows) => { if (!Array.isArray(rows)) throw new Error('Invalid download requests response'); return rows; }),
    ]);
    if (!current() || id !== requestId.current) return;
    const errors: string[] = [];
    if (monthsResult.status === 'fulfilled') {
      const months = monthsResult.value;
      const resolvedMonths = facultySmoke
        ? withFacultyDemoFallback(
            months,
            facultyDemoPayslips() as PublishedMonth[],
            isEmptyArray,
          )
        : months;
      setPublished(resolvedMonths);
      if (resolvedMonths.length) {
        const keys = resolvedMonths.map((m) => m.period_key).sort();
        setPeriodFrom((value) => value || keys[keys.length - 1]!);
        setPeriodTo((value) => value || keys[keys.length - 1]!);
      }
    } else {
      const e = monthsResult.reason;
      if (facultySmoke) {
        const demo = withFacultyDemoFallback(
          [],
          facultyDemoPayslips() as PublishedMonth[],
          isEmptyArray,
        );
        if (demo.length) setPublished(demo);
        if (demo.length) {
          const keys = demo.map((m) => m.period_key).sort();
          setPeriodFrom((value) => value || keys[keys.length - 1]!);
          setPeriodTo((value) => value || keys[keys.length - 1]!);
        }
        if (demo.length === 0) {
          errors.push(`Published payslips: ${e instanceof Error ? e.message : 'Failed to load payslips'}`);
        }
      } else {
        errors.push(`Published payslips: ${e instanceof Error ? e.message : 'Failed to load payslips'}`);
      }
    }
    if (requestsResult.status === 'fulfilled') {
      setRequests(requestsResult.value);
      setRequestSubmitted(false);
    } else errors.push(`Download requests: ${requestsResult.reason instanceof Error ? requestsResult.reason.message : 'Failed to load requests'}`);
    setError(errors.length ? `${afterSave ? 'Request saved, but payslip information could not be fully refreshed. ' : ''}${errors.join(' ')}` : null);
    setLoading(false);
  }, [api, facultySmoke, current]);

  useEffect(() => {
    alive.current = true;
    actionLock.current = false;
    // Payroll and request drafts must be cleared before loading a new account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPublished([]); setRequests([]); setPeriodFrom(''); setPeriodTo(''); setReason('');
    setRequestSubmitted(false); setSubmitting(false); setDownloadingId(null);
    void load();
    return () => { alive.current = false; requestId.current += 1; };
  }, [load]);

  async function submitDownloadRequest(e: FormEvent) {
    e.preventDefault();
    if (actionLock.current || loading || error || hasPending || requestSubmitted || monthsInSelection === 0 || reason.trim().length < 10 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodFrom) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodTo)) return;
    if (periodFrom > periodTo) {
      toast.error('Start month must be before or equal to end month');
      return;
    }
    actionLock.current = true;
    setSubmitting(true);
    try {
      const created = await api.post<DownloadRequest>('/api/hr/payslips/request-download', {
        period_from: periodFrom,
        period_to: periodTo,
        reason: reason.trim(),
      });
      if (!current()) return;
      setRequestSubmitted(true);
      if (created?.request_id) setRequests((rows) => [created, ...rows.filter((row) => row.request_id !== created.request_id)]);
      toast.success('Request sent to HR. Download unlocks after approval.');
      setReason('');
      await load(true);
    } catch (err) {
      if (current()) toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      if (current()) { actionLock.current = false; setSubmitting(false); }
    }
  }

  async function downloadRequest(req: DownloadRequest) {
    if (!token || req.status !== 'APPROVED' || actionLock.current || !current()) return;
    actionLock.current = true;
    setDownloadingId(req.request_id);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/hr/payslips/download-requests/${req.request_id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
        },
      );
      if (!res.ok) {
        let message = 'Download failed';
        try {
          const json = await res.json();
          message = json.message ?? message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      if (!current()) return;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `salary-certificate-${req.period_from}-to-${req.period_to}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      toast.success('Salary certificate downloaded');
    } catch (e) {
      if (current()) toast.error(e instanceof Error ? e.message : 'Failed to download payslip');
    } finally {
      if (current()) { actionLock.current = false; setDownloadingId(null); }
    }
  }

  const hasPending = requests.some((r) => r.status === 'PENDING');

  if (loading && !published.length && !requests.length) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
      </div>
    );
  }

  if (error && !published.length && !requests.length) return <SelfServiceLoadError message={error} onRetry={() => void load()} />;

  if (!published.length && !requests.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No payslips published yet. They appear here after payroll is processed each month.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <SelfServiceLoadError message={error} onRetry={() => { if (!actionLock.current) void load(); }} /> : null}
      <fieldset disabled={submitting || Boolean(downloadingId) || loading} className="min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request payslip download</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Select how many months you need (1 month up to several years). HR approves your reason first.
            Select your period and reason, then submit to HR. After approval, use <strong>Download Payslips</strong> to get the official salary letter on university letterpad (not shown on this page).
          </p>
          {bounds && (
            <p className="mb-3 text-xs text-muted-foreground">
              Published payslips available: {formatMonthKey(bounds.min)} to {formatMonthKey(bounds.max)}
            </p>
          )}
          <form onSubmit={submitDownloadRequest} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">From month</label>
              <Input
                type="month"
                aria-label="From month"
                required
                min={bounds?.min}
                max={bounds?.max}
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To month</label>
              <Input
                type="month"
                aria-label="To month"
                required
                min={bounds?.min}
                max={bounds?.max}
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Reason for request</label>
              <Input
                required
                minLength={10}
                placeholder="e.g. Home loan documentation — bank needs 12 months salary proof"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {monthsInSelection > 0 && (
              <p className="text-xs text-emerald-700 sm:col-span-2">
                {monthsInSelection} published month{monthsInSelection === 1 ? '' : 's'} will be included in your PDF.
              </p>
            )}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                className="gap-2"
                disabled={submitting || loading || Boolean(error) || requestSubmitted || hasPending || monthsInSelection === 0 || reason.trim().length < 10}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit to HR
              </Button>
              {(hasPending || requestSubmitted) && (
                <p className="mt-2 text-xs text-muted-foreground">You already have a request awaiting HR.</p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-sgvu-navy">Published salary history</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((p) => (
            <div key={p.payslip_id} className="rounded-lg border px-3 py-2 text-sm">
              <p className="font-medium">{formatMonthKey(p.period_key)}</p>
              <p className="text-muted-foreground">Net Rs.{Number(p.net_pay).toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
      </div>

      {requests.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-sgvu-navy">Your download requests</h3>
          <div className="space-y-3">
            {requests.map((r) => (
              <Card key={r.request_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-sgvu-navy">
                      {r.period_from && r.period_to
                        ? `${formatMonthKey(r.period_from)} — ${formatMonthKey(r.period_to)}`
                        : 'Salary certificate request'}
                    </p>
                    <p className="mt-1 max-w-lg text-xs text-muted-foreground">{r.reason}</p>
                    <div className="mt-2">{statusBadge(r.status)}</div>
                    {r.status === 'APPROVED' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Download to view the official salary certificate on university letterpad.
                      </p>
                    )}
                    {r.status === 'REJECTED' && r.reviewer_remarks && (
                      <p className="mt-1 text-xs text-destructive">HR: {r.reviewer_remarks}</p>
                    )}
                  </div>
                  {r.status === 'PENDING' && (
                    <Button size="sm" variant="outline" disabled>
                      Awaiting HR
                    </Button>
                  )}
                  {r.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      className="gap-2 bg-sgvu-navy hover:bg-sgvu-navy/90"
                      disabled={downloadingId === r.request_id}
                      onClick={() => void downloadRequest(r)}
                    >
                      {downloadingId === r.request_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download Payslips
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
}
