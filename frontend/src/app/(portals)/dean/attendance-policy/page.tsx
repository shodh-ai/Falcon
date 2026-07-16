'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import type { ThresholdRequest } from '@/lib/attendance-policy';

function statusVariant(status: ThresholdRequest['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  return 'secondary' as const;
}

export default function DeanAttendancePolicyPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<ThresholdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [deptFilter, setDeptFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ThresholdRequest[]>('/api/attendance-policy/dean/threshold-requests');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.dept_name) names.add(row.dept_name);
    }
    return Array.from(names).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (deptFilter === 'ALL') return rows;
    return rows.filter((row) => row.dept_name === deptFilter);
  }, [rows, deptFilter]);

  const pendingCount = useMemo(
    () => filteredRows.filter((row) => row.status === 'PENDING_DEAN').length,
    [filteredRows],
  );

  async function decide(id: string, decision: 'APPROVE' | 'REJECT') {
    setBusyId(id);
    try {
      await api.post(`/api/attendance-policy/dean/threshold-requests/${id}/decision`, {
        decision,
        remarks: remarks[id]?.trim() || undefined,
      });
      toast.success(decision === 'APPROVE' ? 'Approved' : 'Rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Attendance Policy Approvals</h1>
        <p className="text-sm text-muted-foreground">
          HOD requests to relax the minimum attendance bar for departments in your school.
          Approving updates the effective threshold for that department.
        </p>
      </div>

      {!loading && departments.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            className="rounded-lg border px-3 py-2 text-sm"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="ALL">All departments in your school</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </Select>
          {pendingCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              {pendingCount} pending in this view
            </span>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {rows.length === 0
              ? 'No attendance policy requests for your school.'
              : 'No requests match the selected department.'}
          </CardContent>
        </Card>
      ) : (
        filteredRows.map((r) => (
          <Card key={r.request_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Minimum {r.requested_min_percent}%
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}· {r.dept_name ?? 'Department'}
                  </span>
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Requested by {r.requested_by_name ?? 'HOD'}
                </p>
              </div>
              <Badge variant={statusVariant(r.status)}>
                {r.status === 'PENDING_DEAN' ? 'Pending' : r.status === 'APPROVED' ? 'Approved' : 'Rejected'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{r.reason}</p>
              {r.status === 'PENDING_DEAN' ? (
                <div className="space-y-2 border-t pt-3">
                  <textarea
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Remarks (optional)"
                    value={remarks[r.request_id] ?? ''}
                    onChange={(e) =>
                      setRemarks((m) => ({ ...m, [r.request_id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === r.request_id}
                      onClick={() => void decide(r.request_id, 'APPROVE')}
                    >
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.request_id}
                      onClick={() => void decide(r.request_id, 'REJECT')}
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              ) : r.decision_remarks ? (
                <p className="text-xs text-muted-foreground">Your note: {r.decision_remarks}</p>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
