'use client';

import { Suspense, useEffect, useState } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { FacultyEmptyState, FacultyMetricChip } from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { TeamScopeBar, useTeamScope, type TeamScope } from '@/components/self-service/TeamScopeBar';
import { useAuthedApi } from '@/lib/api';

type TabId =
  | 'LEAVE'
  | 'REGULARIZATION'
  | 'ON_DUTY'
  | 'COMP_OFF_CREDIT'
  | 'DOCUMENT'
  | 'APPRAISAL'
  | 'ATTENDANCE_OVERRIDE';

const TABS: { id: TabId; label: string }[] = [
  { id: 'LEAVE', label: 'Leaves' },
  { id: 'REGULARIZATION', label: 'Regularisation' },
  { id: 'ON_DUTY', label: 'On Duty' },
  { id: 'COMP_OFF_CREDIT', label: 'Comp-Off' },
  { id: 'DOCUMENT', label: 'Document Approvals' },
  { id: 'APPRAISAL', label: 'Probation / Appraisals' },
  { id: 'ATTENDANCE_OVERRIDE', label: 'Attendance' },
];

type RequestItem = {
  id: string;
  leave_id?: string;
  request_type: string;
  leave_type: string | null;
  applied_date: string | null;
  raised_on: string | null;
  reason: string | null;
  status: string;
  employee: { name: string; email?: string | null; employee_id?: string | null };
};

type RequestsPayload = {
  count: number;
  tab: string;
  items: RequestItem[];
};

type PendingCounts = {
  leaves: number;
  regularization: number;
  onDuty: number;
  compOff: number;
  documents: number;
  appraisals: number;
  attendanceOverrides: number;
};

const PENDING_COUNT_KEYS: (keyof PendingCounts)[] = [
  'leaves',
  'regularization',
  'onDuty',
  'compOff',
  'documents',
  'appraisals',
];

function sumPendingCounts(counts: PendingCounts): number {
  return PENDING_COUNT_KEYS.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
}

const TAB_COUNT_KEY: Record<TabId, keyof PendingCounts> = {
  LEAVE: 'leaves',
  REGULARIZATION: 'regularization',
  ON_DUTY: 'onDuty',
  COMP_OFF_CREDIT: 'compOff',
  DOCUMENT: 'documents',
  APPRAISAL: 'appraisals',
  ATTENDANCE_OVERRIDE: 'attendanceOverrides',
};

type Props = {
  defaultScope?: TeamScope;
};

function RequestsContent({ defaultScope }: Props) {
  const api = useAuthedApi();
  const scope = useTeamScope(defaultScope);
  const [tab, setTab] = useState<TabId>('LEAVE');
  const [data, setData] = useState<RequestsPayload | null>(null);
  const [counts, setCounts] = useState<PendingCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  async function loadCounts() {
    try {
      const res = await api.get<PendingCounts & { scope?: string }>(
        `/api/hr/team/pending-counts?scope=${scope}`,
      );
      setCounts({
        leaves: Number(res.leaves) || 0,
        regularization: Number(res.regularization) || 0,
        onDuty: Number(res.onDuty) || 0,
        compOff: Number(res.compOff) || 0,
        documents: Number(res.documents) || 0,
        appraisals: Number(res.appraisals) || 0,
      });
    } catch {
      setCounts({
        leaves: 0,
        regularization: 0,
        onDuty: 0,
        compOff: 0,
        documents: 0,
        appraisals: 0,
        attendanceOverrides: 0,
      });
    }
  }

  async function load(active: TabId) {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await api.get<RequestsPayload>(
        `/api/hr/ess/team/requests?scope=${scope}&tab=${active}`,
      );
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
      setData({ count: 0, tab: active, items: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCounts();
  }, [api, scope]);

  useEffect(() => {
    void load(tab);
  }, [api, scope, tab]);

  function tabLabel(t: (typeof TABS)[number]) {
    const n = counts?.[TAB_COUNT_KEY[t.id]] ?? 0;
    return n > 0 ? `${t.label} (${n})` : t.label;
  }

  function toggleAll(checked: boolean) {
    if (!data) return;
    setSelected(checked ? new Set(data.items.map((i) => i.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulkAction(action: 'APPROVE' | 'REJECT') {
    if (!selected.size) {
      toast.error('Select at least one request');
      return;
    }
    if (action === 'REJECT') {
      const comment = window.prompt('Reason for rejection (shown to employee)?');
      if (!comment || comment.length < 3) {
        toast.error('A short reason is required');
        return;
      }
      await runBulk(action, comment);
      return;
    }
    await runBulk(action);
  }

  async function runBulk(action: 'APPROVE' | 'REJECT', comment?: string) {
    setBulkActing(true);
    try {
      await api.patch('/api/hr/ess/team/requests/bulk', {
        ids: [...selected],
        action,
        comment,
        tab,
      });
      toast.success(`${action === 'APPROVE' ? 'Approved' : 'Rejected'} ${selected.size} request(s)`);
      await Promise.all([load(tab), loadCounts()]);
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkActing(false);
    }
  }

  const allSelected = data ? data.items.length > 0 && selected.size === data.items.length : false;

  const totalPending = counts ? sumPendingCounts(counts) : 0;

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <TeamScopeBar defaultScope={defaultScope} />
      </Suspense>

      <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-sgvu-navy shadow-sm'
                : 'text-muted-foreground hover:text-sgvu-navy',
            )}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Inbox className="h-5 w-5 text-sgvu-gold" />
          <FacultyMetricChip label="Pending in scope" value={totalPending} emphasis={totalPending > 0} />
        </div>
        {data && data.items.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" disabled={bulkActing || !selected.size} onClick={() => void bulkAction('APPROVE')}>
              Bulk Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkActing || !selected.size}
              onClick={() => void bulkAction('REJECT')}
            >
              Bulk Reject
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      )}

      {!loading && data && data.items.length === 0 && (
        <FacultyEmptyState
          title="No requests found"
          description={`You have no pending ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} in this scope.`}
        />
      )}

      {!loading && data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-muted-foreground">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-3 py-3">User Name</th>
                <th className="px-3 py-3">Request Type</th>
                <th className="px-3 py-3">Applied Date</th>
                <th className="px-3 py-3">Raised On</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(e) => toggleOne(row.id, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <HrPersonCell name={row.employee.name} subtitle={row.employee.employee_id ?? undefined} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{row.leave_type ?? row.request_type}</span>
                    {row.reason && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{row.reason}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">{row.applied_date ?? '—'}</td>
                  <td className="px-3 py-3">
                    {row.raised_on ? new Date(row.raised_on).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline">{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TeamRequestsPanel({ defaultScope = 'direct' }: Props) {
  return (
    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin" />}>
      <RequestsContent defaultScope={defaultScope} />
    </Suspense>
  );
}
