'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';

type PendingRequest = {
  request_id: string;
  period_from: string | null;
  period_to: string | null;
  reason: string;
  created_at: string;
  staff_name: string;
  staff_email: string;
};

function formatMonthKey(key: string | null) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function monthSpan(from: string | null, to: string | null) {
  if (!from || !to) return '—';
  if (from === to) return formatMonthKey(from);
  return `${formatMonthKey(from)} to ${formatMonthKey(to)}`;
}

export default function HrPayslipDownloadApprovalsPage() {
  const api = useHrApi();
  const [rows, setRows] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<PendingRequest[]>('/api/hr/payslips/download-requests/pending');
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function act(requestId: string, approved: boolean) {
    setActingId(requestId);
    try {
      await api.patch(`/api/hr/payslips/download-requests/${requestId}`, { approved });
      toast.success(approved ? 'Approved — employee gets single-page PDF for selected period' : 'Request rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  }

  return (
    <>
      <HrPageHeader
        title="Payslip download requests"
        description="Employees choose a month range and reason. Approve to let them download one consolidated single-page payslip PDF."
      />

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No pending payslip download requests.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.request_id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sgvu-navy">{r.staff_name}</p>
                  <p className="text-sm text-muted-foreground">{r.staff_email}</p>
                  <p className="mt-1 text-sm">
                    Period: <strong>{monthSpan(r.period_from, r.period_to)}</strong>
                  </p>
                  <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm">{r.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Requested {new Date(r.created_at).toLocaleString('en-IN')}
                  </p>
                  <Badge variant="secondary" className="mt-2">
                    Pending HR
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={actingId === r.request_id}
                    onClick={() => void act(r.request_id, true)}
                  >
                    {actingId === r.request_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actingId === r.request_id}
                    onClick={() => void act(r.request_id, false)}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
