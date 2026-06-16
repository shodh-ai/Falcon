'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CalendarOff, Inbox, UserPlus } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrTabBar } from '@/components/hr/HrTabBar';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrDataTable, HrTable, HrTableHead, HrTh, HrTableBody, HrTr, HrTd } from '@/components/hr/HrDataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type LeaveRequest = {
  leave_id?: string;
  staff_leave_id?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  staff?: { name?: string; email?: string };
};

type BalanceRow = {
  user_id: string;
  name: string;
  employee_id: string;
  cl_balance: string;
  sl_balance: string;
  el_balance: string;
  maternity_balance: string;
};

type DirectoryRow = { user_id: string; name: string; employee_id: string | null };

type OnBehalfForm = {
  staff_user_id: string;
  request_type: 'LEAVE' | 'ON_DUTY' | 'REGULARIZATION';
  leave_type: string;
  start_date: string;
  end_date: string;
  regularization_date: string;
  reason: string;
};

export default function HrLeavesPage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [tab, setTab] = useState<'approvals' | 'balances'>('approvals');
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [staff, setStaff] = useState<DirectoryRow[]>([]);
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  const [onBehalfSubmitting, setOnBehalfSubmitting] = useState(false);
  const [onBehalf, setOnBehalf] = useState<OnBehalfForm>({
    staff_user_id: '',
    request_type: 'ON_DUTY',
    leave_type: 'OD',
    start_date: '',
    end_date: '',
    regularization_date: '',
    reason: '',
  });
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!entityReady) return;
    if (tab === 'approvals') {
      void api.get<LeaveRequest[]>('/api/hr/leaves/all?status=HOD_APPROVED').then(setPending);
    } else {
      void api.get<BalanceRow[]>(`/api/hr/leaves/balances-grid?year=${year}`).then(setBalances);
    }
  }, [api, entityId, entityReady, tab, year]);

  useEffect(() => {
    if (!entityReady) return;
    void api
      .get<{ data: DirectoryRow[] }>('/api/hr/directory?limit=100&offset=0')
      .then((res) => setStaff(res.data));
  }, [api, entityId, entityReady]);

  async function submitOnBehalf(e: FormEvent) {
    e.preventDefault();
    if (!onBehalf.staff_user_id) {
      toast.error('Select an employee');
      return;
    }
    setOnBehalfSubmitting(true);
    try {
      await api.post('/api/hr/workforce/requests', {
        staff_user_id: onBehalf.staff_user_id,
        request_type: onBehalf.request_type,
        leave_type: onBehalf.request_type === 'LEAVE' ? onBehalf.leave_type : onBehalf.request_type === 'ON_DUTY' ? 'OD' : 'REG',
        start_date:
          onBehalf.request_type === 'REGULARIZATION'
            ? onBehalf.regularization_date
            : onBehalf.start_date,
        end_date:
          onBehalf.request_type === 'REGULARIZATION'
            ? onBehalf.regularization_date
            : onBehalf.end_date,
        regularization_date:
          onBehalf.request_type === 'REGULARIZATION' ? onBehalf.regularization_date : undefined,
        reason: onBehalf.reason,
      });
      toast.success('Request submitted on behalf of employee');
      setOnBehalfOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setOnBehalfSubmitting(false);
    }
  }

  async function hrApprove(leaveId: string, status: 'HR_APPROVED' | 'REJECTED') {
    try {
      await api.patch(`/api/hr/staff-leaves/${leaveId}/status`, { status });
      toast.success(status === 'HR_APPROVED' ? 'Leave approved' : 'Leave rejected');
      setPending(await api.get<LeaveRequest[]>('/api/hr/leaves/all?status=HOD_APPROVED'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function adjust(userId: string, leaveType: string, delta: number) {
    try {
      await api.post('/api/hr/leaves/balance-adjust', { user_id: userId, leave_type: leaveType, year, delta });
      toast.success('Balance adjusted');
      setBalances(await api.get<BalanceRow[]>(`/api/hr/leaves/balances-grid?year=${year}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Adjust failed');
    }
  }

  return (
    <>
      <HrPageHeader
        title="Leave Management & Balances"
        description="Final HR sign-off on HoD-approved requests and organization-wide leave balance grid."
        actions={
          <Button variant="outline" size="sm" onClick={() => setOnBehalfOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Apply on Behalf of Employee
          </Button>
        }
      />

      <HrTabBar
        tabs={[
          { id: 'approvals', label: 'Pending approvals' },
          { id: 'balances', label: 'Leave balances' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'approvals' | 'balances')}
      />

      {tab === 'approvals' ? (
        <div className="space-y-3 pt-2">
          {pending.length === 0 ? (
            <HrEmptyState
              icon={Inbox}
              title="No pending leaves"
              description="You're all caught up — no HoD-approved requests awaiting HR sign-off."
            />
          ) : (
            pending.map((l) => {
              const leaveId = l.leave_id ?? l.staff_leave_id ?? '';
              return (
                <Card
                  key={leaveId}
                  className="border-gray-100 shadow-sm transition-shadow hover:shadow-md"
                >
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <HrPersonCell
                        name={l.staff?.name ?? 'Staff member'}
                        subtitle={l.staff?.email ?? `${l.leave_type} · ${l.start_date} → ${l.end_date}`}
                      />
                      <div className="hidden sm:block">
                        <HrStatusBadge status={l.status} />
                      </div>
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <p className="text-sm text-muted-foreground sm:hidden">
                        <HrStatusBadge status={l.status} />
                      </p>
                      <p className="text-sm text-muted-foreground">{l.reason}</p>
                      <div className="flex gap-2 sm:justify-end">
                        <Button size="sm" onClick={() => void hrApprove(leaveId, 'HR_APPROVED')}>
                          HR Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void hrApprove(leaveId, 'REJECTED')}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : balances.length === 0 ? (
        <HrEmptyState
          icon={CalendarOff}
          title="No balance records"
          description="Leave balances will appear once employees are assigned entitlements."
        />
      ) : (
        <HrDataTable>
          <HrTable minWidth="720px">
            <HrTableHead>
              <HrTh>Employee</HrTh>
              <HrTh>CL</HrTh>
              <HrTh>SL</HrTh>
              <HrTh>EL</HrTh>
              <HrTh>Maternity</HrTh>
              <HrTh>Adjust CL</HrTh>
            </HrTableHead>
            <HrTableBody>
              {balances.map((b) => (
                <HrTr key={b.user_id}>
                  <HrTd>
                    <HrPersonCell name={b.name} subtitle={b.employee_id} />
                  </HrTd>
                  <HrTd className="font-medium">{b.cl_balance ?? '—'}</HrTd>
                  <HrTd className="font-medium">{b.sl_balance ?? '—'}</HrTd>
                  <HrTd className="font-medium">{b.el_balance ?? '—'}</HrTd>
                  <HrTd className="font-medium">{b.maternity_balance ?? '—'}</HrTd>
                  <HrTd>
                    <Input
                      type="number"
                      className="h-8 w-20 border-gray-200"
                      placeholder="+/-"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v) void adjust(b.user_id, 'CL', v);
                      }}
                    />
                  </HrTd>
                </HrTr>
              ))}
            </HrTableBody>
          </HrTable>
        </HrDataTable>
      )}

      {onBehalfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Apply on behalf of employee</CardTitle>
              <p className="text-sm text-muted-foreground">
                HR can submit past-date OD or leave requests beyond the 3-day employee lock.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitOnBehalf} className="space-y-3">
                <select
                  className="w-full rounded-md border px-2 py-2 text-sm"
                  required
                  value={onBehalf.staff_user_id}
                  onChange={(e) => setOnBehalf((f) => ({ ...f, staff_user_id: e.target.value }))}
                >
                  <option value="">Select employee…</option>
                  {staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.name} {s.employee_id ? `(${s.employee_id})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-md border px-2 py-2 text-sm"
                  value={onBehalf.request_type}
                  onChange={(e) =>
                    setOnBehalf((f) => ({
                      ...f,
                      request_type: e.target.value as OnBehalfForm['request_type'],
                    }))
                  }
                >
                  <option value="ON_DUTY">On Duty (OD)</option>
                  <option value="LEAVE">Leave</option>
                  <option value="REGULARIZATION">Regularisation</option>
                </select>
                {onBehalf.request_type === 'LEAVE' && (
                  <select
                    className="w-full rounded-md border px-2 py-2 text-sm"
                    value={onBehalf.leave_type}
                    onChange={(e) => setOnBehalf((f) => ({ ...f, leave_type: e.target.value }))}
                  >
                    <option value="CL">Casual (CL)</option>
                    <option value="SL">Sick (SL)</option>
                    <option value="EL">Earned (EL)</option>
                  </select>
                )}
                {onBehalf.request_type === 'REGULARIZATION' ? (
                  <Input
                    type="date"
                    required
                    value={onBehalf.regularization_date}
                    onChange={(e) => setOnBehalf((f) => ({ ...f, regularization_date: e.target.value }))}
                  />
                ) : (
                  <>
                    <Input
                      type="date"
                      required
                      value={onBehalf.start_date}
                      onChange={(e) => setOnBehalf((f) => ({ ...f, start_date: e.target.value }))}
                    />
                    <Input
                      type="date"
                      required
                      value={onBehalf.end_date}
                      onChange={(e) => setOnBehalf((f) => ({ ...f, end_date: e.target.value }))}
                    />
                  </>
                )}
                <Input
                  placeholder="Reason"
                  required
                  value={onBehalf.reason}
                  onChange={(e) => setOnBehalf((f) => ({ ...f, reason: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={onBehalfSubmitting}>
                    Submit
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOnBehalfOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
