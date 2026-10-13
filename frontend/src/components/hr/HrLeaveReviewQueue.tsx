'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { useHrSWR } from '@/hooks/useHrSWR';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type HrReviewRequestType = 'LEAVE' | 'REGULARIZATION';

type ReviewRow = {
  leave_id: string;
  employee_name?: string | null;
  employee_email?: string | null;
  employee_id?: string | null;
  staff?: { name?: string | null; email?: string | null } | null;
  request_type: HrReviewRequestType | 'ON_DUTY';
  leave_type?: string | null;
  start_date: string;
  end_date: string;
  regularization_date?: string | null;
  missed_punch_type?: 'IN' | 'OUT' | 'BOTH' | null;
  applied_at?: string | null;
  reason?: string | null;
  status: string;
  recorded_check_in?: string | null;
  recorded_check_out?: string | null;
};

export function HrLeaveReviewQueue({ requestType }: { requestType: HrReviewRequestType }) {
  const api = useHrApi();
  const { entityReady } = useHrEntity();
  const { data: rows = [], error, isLoading, mutate } = useHrSWR<ReviewRow[]>(
    ['hr-leave-review', requestType],
    `/api/hr/leaves/review?request_type=${requestType}`,
    { dedupingInterval: 0, revalidateOnMount: true },
  );
  const [actingId, setActingId] = useState<string | null>(null);

  async function decide(leaveId: string, action: 'APPROVE' | 'REJECT') {
    setActingId(leaveId);
    try {
      await api.patch(`/api/hr/leaves/review/${leaveId}`, { action });
      toast.success(action === 'APPROVE' ? 'Final HR approval recorded' : 'Request rejected');
      await mutate();
      window.dispatchEvent(new CustomEvent('falcon:notifications-refresh'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not record decision');
    } finally {
      setActingId(null);
    }
  }

  if (!entityReady) {
    return <p role="alert" className="py-6 text-sm text-muted-foreground">Select an organization entity to review HR requests.</p>;
  }

  if (isLoading && rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Loading requests awaiting HR sign-off…</p>;
  }

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error instanceof Error ? error.message : 'Could not load requests'}
        {' '}<Button size="sm" variant="outline" onClick={() => void mutate()}>Retry</Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <HrEmptyState
        icon={Inbox}
        title={`No pending ${requestType === 'LEAVE' ? 'leave or on-duty requests' : 'regularizations'}`}
        description="No requests of this type currently await your final HR sign-off."
      />
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {rows.map((row) => {
        const name = row.employee_name ?? row.staff?.name ?? 'Staff member';
        const email = row.employee_email ?? row.staff?.email ?? null;
        const date = requestType === 'REGULARIZATION'
          ? row.regularization_date ?? row.start_date
          : row.start_date === row.end_date
            ? row.start_date
            : `${row.start_date} – ${row.end_date}`;
        return (
          <Card key={row.leave_id} className="border-gray-100 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <HrPersonCell
                  name={name}
                  subtitle={row.employee_id
                    ? `${row.employee_id}${email ? ` · ${email}` : ''}`
                    : email ?? 'Employee'}
                />
                {requestType === 'LEAVE' && (
                  <p className="text-xs font-medium text-sgvu-navy">
                    Request: {row.request_type === 'ON_DUTY' ? 'On duty' : 'Leave'}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{requestType === 'REGULARIZATION' ? 'Attendance date' : 'Request dates'}: {date}</span>
                  {row.leave_type && <span>· {row.leave_type}</span>}
                  <span>· Status:</span>
                  <HrStatusBadge status={row.status} />
                </div>
                {requestType === 'REGULARIZATION' && (
                  <p className="text-sm">
                    Requested correction: {row.missed_punch_type === 'IN'
                      ? 'missing check-in'
                      : row.missed_punch_type === 'OUT'
                        ? 'missing check-out'
                        : row.missed_punch_type === 'BOTH'
                          ? 'missing check-in and check-out'
                          : 'attendance regularization'}
                  </p>
                )}
                {row.applied_at && (
                  <p className="text-xs text-muted-foreground">Submitted: {new Date(row.applied_at).toLocaleString()}</p>
                )}
                {row.reason && <p className="text-sm">{row.reason}</p>}
                {requestType === 'REGULARIZATION' && (
                  <p className="text-xs text-muted-foreground">
                    Recorded punches: {row.recorded_check_in ? new Date(row.recorded_check_in).toLocaleTimeString() : 'no check-in'}
                    {' · '}
                    {row.recorded_check_out ? new Date(row.recorded_check_out).toLocaleTimeString() : 'no check-out'}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={actingId !== null}
                  onClick={() => void decide(row.leave_id, 'APPROVE')}
                >
                  {actingId === row.leave_id ? 'Saving…' : 'Final HR Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actingId !== null}
                  onClick={() => void decide(row.leave_id, 'REJECT')}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
