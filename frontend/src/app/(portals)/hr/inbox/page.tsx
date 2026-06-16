'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Check, Inbox, X } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useHrApi } from '@/lib/api/use-hr-api';

type InboxItem = {
  leave_id: string;
  request_type: string;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  current_step_order: number | null;
  employee: { name: string; department?: string | null };
  title: string;
};

type InboxResponse = {
  count: number;
  items: InboxItem[];
};

type AdminPendingItem = {
  leave_id: string;
  request_type: string;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  employee_name: string;
  approver_name: string | null;
};

type AdminPendingResponse = {
  count: number;
  items: AdminPendingItem[];
};

export default function HrInboxPage() {
  const api = useHrApi();
  const { user } = useAuth();
  const isHrAdmin = [user?.role, ...(user?.roles ?? [])].some((r) =>
    ['HRAdmin', 'SuperAdmin', 'HR'].includes(r ?? ''),
  );
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [adminPending, setAdminPending] = useState<AdminPendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const tasks: Promise<void>[] = [
      api
        .get<InboxResponse>('/api/hr/inbox/pending')
        .then(setInbox)
        .catch(() => setInbox({ count: 0, items: [] }))
        .then(() => undefined),
    ];
    if (isHrAdmin) {
      tasks.push(
        api
          .get<AdminPendingResponse>('/api/hr/admin/pending-requests')
          .then(setAdminPending)
          .catch(() => setAdminPending({ count: 0, items: [] }))
          .then(() => undefined),
      );
    }
    void Promise.all(tasks).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  async function act(leaveId: string, action: 'APPROVE' | 'REJECT', override = false) {
    setActing(leaveId);
    try {
      if (override) {
        await api.patch(`/api/hr/admin/requests/${leaveId}/override`, { action });
        toast.success(`Bypass ${action === 'APPROVE' ? 'approved' : 'rejected'}`);
      } else {
        await api.patch(`/api/hr/workforce/team/${leaveId}/action`, { action });
        toast.success(action === 'APPROVE' ? 'Approved' : 'Rejected');
      }
      load();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(null);
    }
  }

  if (loading) return <FalconLoader label="Loading your approval inbox…" />;

  return (
    <>
      <HrPageHeader
        title="Pending on Me"
        description="Maker-checker approvals routed to you. You'll also receive in-app notifications in the bell when something needs your action."
      />

      <div className="mb-4 flex items-center gap-2">
        <Inbox className="h-5 w-5 text-sgvu-gold" />
        <Badge variant={inbox?.count ? 'destructive' : 'secondary'}>
          {inbox?.count ?? 0} pending
        </Badge>
      </div>

      <div className="space-y-3">
        {(inbox?.items ?? []).map((item) => (
          <Card key={item.leave_id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.request_type.replace(/_/g, ' ')}
                  {item.leave_type ? ` · ${item.leave_type}` : ''} · {item.start_date}
                  {item.end_date !== item.start_date ? ` – ${item.end_date}` : ''}
                </p>
                {item.employee.department && (
                  <p className="text-xs text-muted-foreground">{item.employee.department}</p>
                )}
                {item.reason && <p className="mt-2 text-sm">{item.reason}</p>}
                {item.current_step_order != null && (
                  <Badge variant="outline" className="mt-2">
                    Step {item.current_step_order}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting === item.leave_id}
                  onClick={() => void act(item.leave_id, 'REJECT')}
                >
                  <X className="mr-1 h-3 w-3" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={acting === item.leave_id}
                  onClick={() => void act(item.leave_id, 'APPROVE')}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!inbox?.items.length && (
        <p className="text-sm text-muted-foreground">You&apos;re all caught up — no pending approvals.</p>
      )}

      {isHrAdmin && (adminPending?.count ?? 0) > 0 && (
        <section className="mt-10 space-y-3">
          <HrPageHeader
            title="HR Admin Override"
            description="Bypass stalled approvers so payroll and attendance are not blocked."
          />
          <Badge variant="destructive">{adminPending?.count} system-wide pending</Badge>
          {(adminPending?.items ?? []).map((item) => (
            <Card key={`admin-${item.leave_id}`} className="border-amber-200">
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold">
                    {item.employee_name} — {item.request_type.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.leave_type ?? ''} · {item.start_date}
                    {item.end_date !== item.start_date ? ` – ${item.end_date}` : ''}
                  </p>
                  <p className="text-xs text-amber-800">
                    Assigned approver: {item.approver_name ?? 'Unassigned'}
                  </p>
                  {item.reason && <p className="mt-2 text-sm">{item.reason}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting === item.leave_id}
                    onClick={() => void act(item.leave_id, 'REJECT', true)}
                  >
                    Force Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={acting === item.leave_id}
                    onClick={() => void act(item.leave_id, 'APPROVE', true)}
                  >
                    Bypass Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </>
  );
}
