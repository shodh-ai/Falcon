'use client';

import { Suspense, useEffect, useState } from 'react';
import { Inbox, Loader2, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { TeamScopeBar, useTeamScope } from '@/components/ess/TeamScopeBar';
import { useAuthedApi } from '@/lib/api';

type TabId =
  | 'LEAVE'
  | 'REGULARIZATION'
  | 'ON_DUTY'
  | 'COMP_OFF_CREDIT'
  | 'DOCUMENT'
  | 'APPRAISAL';

const TABS: { id: TabId; label: string }[] = [
  { id: 'LEAVE', label: 'Leaves' },
  { id: 'REGULARIZATION', label: 'Regularisation' },
  { id: 'ON_DUTY', label: 'On Duty' },
  { id: 'COMP_OFF_CREDIT', label: 'Comp-Off' },
  { id: 'DOCUMENT', label: 'Document Approvals' },
  { id: 'APPRAISAL', label: 'Probation / Appraisals' },
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

function RequestsContent() {
  const api = useAuthedApi();
  const scope = useTeamScope();
  const [tab, setTab] = useState<TabId>('LEAVE');
  const [data, setData] = useState<RequestsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

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
    void load(tab);
  }, [api, scope, tab]);

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
      await load(tab);
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkActing(false);
    }
  }

  const allSelected = data ? data.items.length > 0 && selected.size === data.items.length : false;

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <TeamScopeBar />
      </Suspense>

      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t.id ? 'bg-background text-sgvu-navy shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-sgvu-gold" />
          <Badge variant={data?.count ? 'destructive' : 'secondary'}>{data?.count ?? 0} pending</Badge>
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
        <HrEmptyState
          icon={PackageOpen}
          title="No Requests Found"
          description={`You have no pending ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} in this scope.`}
        />
      )}

      {!loading && data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-muted-foreground">
                <th className="px-3 py-3 w-10">
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

export default function EssTeamRequestsPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin" />}>
      <RequestsContent />
    </Suspense>
  );
}
