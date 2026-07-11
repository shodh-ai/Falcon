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
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { HodGatePassApprovalsPanel } from '@/components/hod/HodGatePassApprovalsPanel';

function leaveDocHref(path: string): string {
  if (path.startsWith('http')) return path;
  return `${getApiBaseUrl()}/api/uploads/download?path=${encodeURIComponent(path)}`;
}

type FundingApprovalRole = 'hod' | 'dean';

function resolveUserRoles(user: { role?: string; roles?: string[]; primaryRole?: string } | null): string[] {
  if (!user) return [];
  if (user.roles?.length) return user.roles;
  return [user.primaryRole ?? user.role].filter(Boolean) as string[];
}

function fundingApprovalRole(user: { role?: string; roles?: string[]; primaryRole?: string } | null): FundingApprovalRole | null {
  const roles = resolveUserRoles(user);
  if (roles.some((r) => ['SuperAdmin', 'HOD'].includes(r))) return 'hod';
  if (roles.includes('Dean')) return 'dean';
  return null;
}

function hodApprovalRole(user: { role?: string; roles?: string[]; primaryRole?: string } | null): boolean {
  return resolveUserRoles(user).some((r) => ['SuperAdmin', 'HOD'].includes(r));
}

async function fetchPendingFundingRequests(
  api: ReturnType<typeof useAuthedApi>,
  role: FundingApprovalRole,
): Promise<any[]> {
  if (role === 'dean') {
    const rows = await api.get<any[]>('/api/academics/dean/funding-requests');
    return rows.filter((r) => r.status === 'APPROVED_HOD');
  }
  const rows = await api.get<any[]>('/api/academics/hod/funding-requests');
  return rows.filter((r) => r.status === 'PENDING_HOD');
}

function mapFundingRows(rows: any[], role: FundingApprovalRole): RequestItem[] {
  return rows.map((r) => ({
    id: r.request_id,
    request_type: `Project Funding (₹${r.amount})`,
    leave_type: r.project_title,
    applied_date: r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : null,
    raised_on: r.created_at,
    reason: r.purpose,
    status: role === 'dean' ? 'Pending Dean' : 'Pending HOD',
    employee: { name: r.faculty_name },
  }));
}

type TabId =
  | 'LEAVE'
  | 'GATE_PASS'
  | 'REGULARIZATION'
  | 'ON_DUTY'
  | 'COMP_OFF_CREDIT'
  | 'DOCUMENT'
  | 'APPRAISAL'
  | 'ATTENDANCE_OVERRIDE'
  | 'FUNDING_REQUESTS';

const TABS: { id: TabId; label: string }[] = [
  { id: 'LEAVE', label: 'Leaves' },
  { id: 'GATE_PASS', label: 'Gate Pass' },
  { id: 'REGULARIZATION', label: 'Regularisation' },
  { id: 'ON_DUTY', label: 'On Duty' },
  { id: 'COMP_OFF_CREDIT', label: 'Comp-Off' },
  { id: 'DOCUMENT', label: 'Document Approvals' },
  { id: 'APPRAISAL', label: 'Probation / Appraisals' },
  { id: 'ATTENDANCE_OVERRIDE', label: 'Attendance' },
  { id: 'FUNDING_REQUESTS', label: 'Project Funding' },
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
  supporting_doc_urls?: string[];
  employee: { name: string; email?: string | null; employee_id?: string | null };
};

type RequestsPayload = {
  count: number;
  tab: string;
  items: RequestItem[];
};

type PendingCounts = {
  leaves: number;
  gatePasses: number;
  regularization: number;
  onDuty: number;
  compOff: number;
  documents: number;
  appraisals: number;
  attendanceOverrides: number;
  fundingRequests: number;
};

const PENDING_COUNT_KEYS: (keyof PendingCounts)[] = [
  'leaves',
  'gatePasses',
  'regularization',
  'onDuty',
  'compOff',
  'documents',
  'appraisals',
  'fundingRequests',
];

function sumPendingCounts(counts: PendingCounts): number {
  return PENDING_COUNT_KEYS.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
}

const TAB_COUNT_KEY: Record<TabId, keyof PendingCounts> = {
  LEAVE: 'leaves',
  GATE_PASS: 'gatePasses',
  REGULARIZATION: 'regularization',
  ON_DUTY: 'onDuty',
  COMP_OFF_CREDIT: 'compOff',
  DOCUMENT: 'documents',
  APPRAISAL: 'appraisals',
  ATTENDANCE_OVERRIDE: 'attendanceOverrides',
  FUNDING_REQUESTS: 'fundingRequests',
};

type Props = {
  defaultScope?: TeamScope;
};

function RequestsContent({ defaultScope }: Props) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const fundingRole = fundingApprovalRole(user);
  const showGatePassTab = hodApprovalRole(user);
  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'FUNDING_REQUESTS') return Boolean(fundingRole);
    if (t.id === 'GATE_PASS') return showGatePassTab;
    return true;
  });
  const scope = useTeamScope(defaultScope);
  const [tab, setTab] = useState<TabId>('LEAVE');
  const [data, setData] = useState<RequestsPayload | null>(null);
  const [counts, setCounts] = useState<PendingCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  async function loadCounts() {
    try {
      const res = await api.get<PendingCounts & { scope?: string }>(`/api/hr/team/pending-counts?scope=${scope}`);
      let pendingFunding = 0;
      let pendingGatePasses = 0;
      if (fundingRole) {
        try {
          const fundingRows = await fetchPendingFundingRequests(api, fundingRole);
          pendingFunding = fundingRows.length;
        } catch {
          pendingFunding = 0;
        }
      }
      if (showGatePassTab) {
        try {
          const gatePassRows = await api.get<unknown[]>('/api/academics/hod/approvals/gate-passes');
          pendingGatePasses = gatePassRows?.length ?? 0;
        } catch {
          pendingGatePasses = 0;
        }
      }

      setCounts({
        leaves: Number(res.leaves) || 0,
        gatePasses: pendingGatePasses,
        regularization: Number(res.regularization) || 0,
        onDuty: Number(res.onDuty) || 0,
        compOff: Number(res.compOff) || 0,
        documents: Number(res.documents) || 0,
        appraisals: Number(res.appraisals) || 0,
        attendanceOverrides: Number(res.attendanceOverrides) || 0,
        fundingRequests: pendingFunding,
      });
    } catch {
      setCounts({
        leaves: 0,
        gatePasses: 0,
        regularization: 0,
        onDuty: 0,
        compOff: 0,
        documents: 0,
        appraisals: 0,
        attendanceOverrides: 0,
        fundingRequests: 0,
      });
    }
  }

  async function load(active: TabId) {
    setLoading(true);
    setSelected(new Set());
    try {
      if (active === 'FUNDING_REQUESTS') {
        if (!fundingRole) {
          setData({ count: 0, tab: active, items: [] });
          return;
        }
        const res = await fetchPendingFundingRequests(api, fundingRole);
        const items = mapFundingRows(res, fundingRole);
        setData({ count: items.length, tab: active, items });
      } else {
        const res = await api.get<RequestsPayload>(
          `/api/hr/ess/team/requests?scope=${scope}&tab=${active}`,
        );
        setData(res);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
      setData({ count: 0, tab: active, items: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCounts();
  }, [api, scope, fundingRole, showGatePassTab]);

  useEffect(() => {
    if (tab === 'FUNDING_REQUESTS' && !fundingRole && visibleTabs.length) {
      setTab(visibleTabs[0].id);
      return;
    }
    if (tab === 'GATE_PASS' && !showGatePassTab && visibleTabs.length) {
      setTab(visibleTabs[0].id);
      return;
    }
    if (tab === 'GATE_PASS') {
      setLoading(false);
      return;
    }
    void load(tab);
  }, [api, scope, tab, fundingRole, showGatePassTab]);

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
      if (tab === 'FUNDING_REQUESTS' && fundingRole) {
        const status =
          fundingRole === 'dean'
            ? action === 'APPROVE'
              ? 'APPROVED_DEAN'
              : 'REJECTED_DEAN'
            : action === 'APPROVE'
              ? 'APPROVED_HOD'
              : 'REJECTED_HOD';
        const endpoint =
          fundingRole === 'dean'
            ? '/api/academics/dean/funding-requests'
            : '/api/academics/hod/funding-requests';
        await Promise.all(
          [...selected].map((id) =>
            api.patch(`${endpoint}/${id}`, {
              status,
              commitMessage: comment || '',
            }),
          ),
        );
        toast.success(`${action === 'APPROVE' ? 'Approved' : 'Rejected'} ${selected.size} funding request(s)`);
      } else {
        await api.patch('/api/hr/ess/team/requests/bulk', {
          ids: [...selected],
          action,
          comment,
          tab,
        });
        toast.success(`${action === 'APPROVE' ? 'Approved' : 'Rejected'} ${selected.size} request(s)`);
      }
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
        {visibleTabs.map((t) => (
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
        {data && data.items.length > 0 && tab !== 'GATE_PASS' && (
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

      {tab === 'GATE_PASS' ? (
        <HodGatePassApprovalsPanel onUpdated={() => void loadCounts()} />
      ) : (
        <>
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
                    {row.supporting_doc_urls && row.supporting_doc_urls.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {row.supporting_doc_urls.map((url, i) => (
                          <a
                            key={`${row.id}-doc-${i}`}
                            href={leaveDocHref(url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-700 underline"
                          >
                            📎 Attachment {i + 1}
                          </a>
                        ))}
                      </div>
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
        </>
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
