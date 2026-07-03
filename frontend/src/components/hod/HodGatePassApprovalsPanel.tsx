'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type GatePassRow = {
  pass_id: string;
  date: string;
  out_time_display: string;
  expected_in_display: string;
  reason: string | null;
  staff: { name: string; email?: string | null };
};

export function HodGatePassApprovalsPanel() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<GatePassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<GatePassRow[]>('/api/academics/hod/approvals/gate-passes');
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load gate passes');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(passId: string, status: 'APPROVED' | 'REJECTED') {
    setActingId(passId);
    try {
      await api.patch(`/api/hr/gate-passes/${passId}/action`, { status });
      toast.success(status === 'APPROVED' ? 'Gate pass approved' : 'Gate pass rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground font-medium">
        No pending gate pass requests.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row.pass_id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-sgvu-navy">{row.staff.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.date} · Out {row.out_time_display} · Expected in {row.expected_in_display}
            </p>
            {row.reason ? (
              <p className="text-xs text-slate-500 mt-1">{row.reason}</p>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-sgvu-navy hover:bg-sgvu-navy/90"
              disabled={actingId === row.pass_id}
              onClick={() => void act(row.pass_id, 'APPROVED')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={actingId === row.pass_id}
              onClick={() => void act(row.pass_id, 'REJECTED')}
            >
              Reject
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
