'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IndianRupee, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createAcademicRndApi, type RndApplication } from '@/lib/api/api.academic-rnd';

function formatInr(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function FinanceRndBudgetPage() {
  const api = useAuthedApi();
  const rndApi = useMemo(() => createAcademicRndApi(api), [api]);
  const [queue, setQueue] = useState<RndApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setQueue(await rndApi.budgetQueue());
  }, [rndApi]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function approve(id: string) {
    try {
      await rndApi.approveBudget(id, remarks[id]);
      toast.success('Budget approved — forwarded to ranking committee');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  async function reject(id: string) {
    const text = remarks[id]?.trim();
    if (!text) {
      toast.error('Remarks required for rejection');
      return;
    }
    try {
      await rndApi.rejectBudget(id, text);
      toast.success('Budget rejected — student notified');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sgvu-navy">
          <IndianRupee className="h-7 w-7" />
          R&D Grant — Budget Review
        </h1>
        <p className="text-sm text-muted-foreground">Step 2: Approve or reject requested research funds.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Budget Approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications awaiting budget review.</p>
          ) : (
            queue.map((app) => (
              <div key={app.application_id} className="space-y-2 rounded-lg border p-4">
                <p className="font-semibold text-sgvu-navy">{app.project_title}</p>
                <p className="text-xs text-muted-foreground">
                  {app.student_name} · Requested {formatInr(app.requested_budget)}
                </p>
                <Input
                  placeholder="Remarks (required for reject)"
                  value={remarks[app.application_id] ?? ''}
                  onChange={(e) => setRemarks((r) => ({ ...r, [app.application_id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void approve(app.application_id)}>
                    Approve Budget
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void reject(app.application_id)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
