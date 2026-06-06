'use client';

import { useEffect, useState } from 'react';
import { CalendarOff, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrTabBar } from '@/components/hr/HrTabBar';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrDataTable, HrTable, HrTableHead, HrTh, HrTableBody, HrTr, HrTd } from '@/components/hr/HrDataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

export default function HrLeavesPage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [tab, setTab] = useState<'approvals' | 'balances'>('approvals');
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!entityReady) return;
    if (tab === 'approvals') {
      void api.get<LeaveRequest[]>('/api/hr/leaves/all?status=HOD_APPROVED').then(setPending);
    } else {
      void api.get<BalanceRow[]>(`/api/hr/leaves/balances-grid?year=${year}`).then(setBalances);
    }
  }, [api, entityId, entityReady, tab, year]);

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
    </>
  );
}
