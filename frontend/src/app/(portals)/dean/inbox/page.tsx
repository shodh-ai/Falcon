'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodActionButton,
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { DeanApprovalTimeline } from '@/components/dean/DeanApprovalTimeline';
import { buildDeanPageQuery, type PaginatedApiResponse } from '@/lib/dean-pagination';
import { PaginationBar } from '@/components/ui/PaginationBar';

type InboxRow = {
  id: string;
  type: string;
  title: string;
  employee_name: string;
  date_label: string;
  detail: string;
  created_at: string;
  action_href?: string;
};

type FundingRequest = {
  request_id: string;
  project_title: string;
  faculty_name: string;
  dept_name: string;
  amount: number;
  purpose: string;
  status: 'APPROVED_HOD';
};

const TYPE_ROUTES: Record<string, string> = {
  FUNDING: '/dean/inbox',
  ATTENDANCE_POLICY: '/dean/attendance-policy',
  EVENT: '/dean/events',
  GRIEVANCE: '/dean/students/grievances',
  EXTRA_CLASS: '/dean/academics/timetable',
  CANCEL: '/dean/academics/timetable',
};

export default function DeanInboxPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [funding, setFunding] = useState<FundingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [inboxOffset, setInboxOffset] = useState(0);
  const [inboxTotal, setInboxTotal] = useState(0);
  const inboxLimit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildDeanPageQuery({ page: Math.floor(inboxOffset / inboxLimit) + 1, limit: inboxLimit });
      const [inbox, fundingRows] = await Promise.all([
        api.get<PaginatedApiResponse<InboxRow>>(`/api/academics/dean/inbox?${qs}`),
        api.get<FundingRequest[]>('/api/academics/dean/funding-requests'),
      ]);
      setRows((inbox.data ?? []).filter((row) => row.type !== 'FUNDING'));
      setInboxTotal(inbox.total ?? 0);
      setFunding((fundingRows ?? []).filter((r) => r.status === 'APPROVED_HOD'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dean inbox');
      setRows([]);
      setFunding([]);
    } finally {
      setLoading(false);
    }
  }, [api, inboxOffset]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedFunding = timelineId
    ? funding.find((r) => r.request_id === timelineId) ?? null
    : null;

  const handleFundingAction = async (
    requestId: string,
    action: 'APPROVED_DEAN' | 'REJECTED_DEAN',
  ) => {
    const comment = comments[requestId] || '';
    if (action === 'REJECTED_DEAN' && !comment.trim()) {
      toast.error('A comment is required when rejecting a request.');
      return;
    }
    try {
      await api.patch(`/api/academics/dean/funding-requests/${requestId}`, {
        status: action,
        commitMessage: comment,
      });
      toast.success(`Request ${action === 'APPROVED_DEAN' ? 'approved' : 'rejected'}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Dean Inbox"
        description="School-wide approvals escalated from departments — funding, attendance policy, events, and grievances."
        workspaceLabel="Dean Workspace"
        meta={
          <span>
            {funding.length + rows.length} pending item{funding.length + rows.length === 1 ? '' : 's'}
          </span>
        }
        actions={
          <HodActionButton href="/dean/dashboard" variant="outline">
            Command Center
          </HodActionButton>
        }
      />

      {funding.length > 0 ? (
        <HodPanel title="Research & Project Funding">
          <div className="grid gap-4 xl:grid-cols-2">
            {funding.map((req) => (
              <div key={req.request_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      className="text-left font-semibold text-sgvu-navy hover:underline"
                      onClick={() => setTimelineId(req.request_id)}
                      aria-label={`View approval timeline for ${req.project_title}`}
                    >
                      {req.project_title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {req.faculty_name} · {req.dept_name}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-sgvu-navy">
                    ₹{req.amount.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">{req.purpose}</p>
                <textarea
                  placeholder="Dean's comment (required for rejection)"
                  className="mb-3 flex min-h-[72px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={comments[req.request_id] || ''}
                  onChange={(e) =>
                    setComments((prev) => ({ ...prev, [req.request_id]: e.target.value }))
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    onClick={() => void handleFundingAction(req.request_id, 'REJECTED_DEAN')}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                    onClick={() => void handleFundingAction(req.request_id, 'APPROVED_DEAN')}
                  >
                    <CheckCircle className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </HodPanel>
      ) : null}

      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => `${r.type}-${r.id}`}
        empty={
          funding.length
            ? 'No other pending dean approvals.'
            : 'No pending dean approvals across your school.'
        }
        columns={[
          {
            key: 'type',
            label: 'Type',
            render: (r) => (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {r.type.replace(/_/g, ' ')}
              </span>
            ),
          },
          {
            key: 'title',
            label: 'Request',
            render: (r) => (
              <div>
                <p className="font-semibold text-sgvu-navy">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
            ),
          },
          {
            key: 'from',
            label: 'From',
            render: (r) => r.employee_name,
          },
          {
            key: 'when',
            label: 'Details',
            render: (r) => r.date_label,
          },
          {
            key: 'action',
            label: '',
            className: 'text-right',
            render: (r) => (
              <Link
                href={r.action_href ?? TYPE_ROUTES[r.type] ?? '/dean/inbox'}
                className="text-sm font-semibold text-sgvu-navy hover:underline"
              >
                Review →
              </Link>
            ),
          },
        ]}
      />

      <PaginationBar
        total={inboxTotal}
        limit={inboxLimit}
        offset={inboxOffset}
        onPageChange={setInboxOffset}
      />

      {selectedFunding ? (
        <DeanApprovalTimeline type="FUNDING" id={selectedFunding.request_id} />
      ) : null}
    </HodPageFrame>
  );
}
