'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  const api = useAuthedApi();
  const { token } = useAuth();
  const [published, setPublished] = useState<PublishedMonth[]>([]);
  const [requests, setRequests] = useState<DownloadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  async function load() {
    setLoading(true);
    try {
      const [months, reqs] = await Promise.all([
        api.get<PublishedMonth[]>('/api/hr/payslips/my-payslips'),
        api.get<DownloadRequest[]>('/api/hr/payslips/download-requests/mine'),
      ]);
      setPublished(months);
      setRequests(reqs);
      if (months.length && !periodFrom) {
        const keys = months.map((m) => m.period_key).sort();
        setPeriodFrom(keys[keys.length - 1]);
        setPeriodTo(keys[keys.length - 1]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load payslips');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function submitDownloadRequest(e: FormEvent) {
    e.preventDefault();
    if (!periodFrom || !periodTo) return;
    if (periodFrom > periodTo) {
      toast.error('Start month must be before or equal to end month');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/hr/payslips/request-download', {
        period_from: periodFrom,
        period_to: periodTo,
        reason,
      });
      toast.success('Request sent to HR. Download unlocks after approval.');
      setReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadRequest(req: DownloadRequest) {
    if (!token || req.status !== 'APPROVED') return;
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
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `salary-certificate-${req.period_from}-to-${req.period_to}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      toast.success('Salary certificate downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download payslip');
    } finally {
      setDownloadingId(null);
    }
  }

  const hasPending = requests.some((r) => r.status === 'PENDING');

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
      </div>
    );
  }

  if (!published.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No payslips published yet. They appear here after payroll is processed each month.
      </p>
    );
  }

  return (
    <div className="space-y-6">
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
                disabled={submitting || hasPending || monthsInSelection === 0 || reason.trim().length < 10}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit to HR
              </Button>
              {hasPending && (
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
    </div>
  );
}
