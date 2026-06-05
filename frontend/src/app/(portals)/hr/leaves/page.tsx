'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  staff?: { name?: string };
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
  const { entityId } = useHrEntity();
  const [tab, setTab] = useState<'approvals' | 'balances'>('approvals');
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (tab === 'approvals') {
      void api.get<LeaveRequest[]>('/api/hr/leaves/all?status=HOD_APPROVED').then(setPending);
    } else {
      void api.get<BalanceRow[]>(`/api/hr/leaves/balances-grid?year=${year}`).then(setBalances);
    }
  }, [api, entityId, tab, year]);

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
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Leave Management & Balances"
        description="Final HR sign-off on HoD-approved requests and organization-wide leave balance grid."
      />

      <div className="flex gap-2">
        <Button variant={tab === 'approvals' ? 'default' : 'outline'} size="sm" onClick={() => setTab('approvals')}>
          Pending approvals
        </Button>
        <Button variant={tab === 'balances' ? 'default' : 'outline'} size="sm" onClick={() => setTab('balances')}>
          Leave balances
        </Button>
      </div>

      {tab === 'approvals' ? (
        <div className="space-y-3">
          {pending.map((l) => {
            const leaveId = l.leave_id ?? l.staff_leave_id ?? '';
            return (
            <Card key={leaveId}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{l.staff?.name ?? 'Staff'}</CardTitle>
                <Badge>{l.status}</Badge>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  {l.leave_type}: {l.start_date} → {l.end_date}
                </p>
                <p className="text-muted-foreground">{l.reason}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void hrApprove(leaveId, 'HR_APPROVED')}>
                    HR Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void hrApprove(leaveId, 'REJECTED')}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
          })}
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">No HoD-approved leaves pending HR.</p> : null}
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-3">Employee</th>
                  <th className="p-3">CL</th>
                  <th className="p-3">SL</th>
                  <th className="p-3">EL</th>
                  <th className="p-3">Maternity</th>
                  <th className="p-3">Adjust CL</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.user_id} className="border-b">
                    <td className="p-3">
                      {b.name}
                      <span className="block text-xs text-muted-foreground">{b.employee_id}</span>
                    </td>
                    <td className="p-3">{b.cl_balance ?? '—'}</td>
                    <td className="p-3">{b.sl_balance ?? '—'}</td>
                    <td className="p-3">{b.el_balance ?? '—'}</td>
                    <td className="p-3">{b.maternity_balance ?? '—'}</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        className="h-8 w-20"
                        placeholder="+/-"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v) void adjust(b.user_id, 'CL', v);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
