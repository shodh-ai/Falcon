'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';

type LeaveBalance = {
  leave_type: string;
  entitled: string | number;
  used: string | number;
};

type StaffLeave = {
  leave_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
};

type Payslip = {
  payslip_id: string;
  month: string;
  year: number;
  net_pay: string | null;
  file_path: string;
};

type AttendanceCalendar = {
  month: string;
  attendance: { date: string; status: 'PRESENT' | 'ABSENT'; check_in_at: string | null; check_out_at: string | null }[];
  leaves: { leave_id: string; leave_type: string; start_date: string; end_date: string; status: string }[];
};

type GatePass = {
  pass_id: string;
  out_time: string;
  expected_in_time: string;
  reason: string;
  status: string;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthDays(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const first = new Date(year, monthIndex - 1, 1);
  const count = new Date(year, monthIndex, 0).getDate();
  return {
    leading: first.getDay(),
    days: Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      return `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }),
  };
}

export default function FacultyLeavesPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [calendar, setCalendar] = useState<AttendanceCalendar | null>(null);
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({
    leave_type: 'CL',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [gatePassForm, setGatePassForm] = useState({
    out_time: '',
    expected_in_time: '',
    reason: '',
  });

  async function loadHr() {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const [balanceData, leaveData, payslipData, calendarData, gatePassData] = await Promise.all([
        api.get<LeaveBalance[]>(`/hr/balances/${user.user_id}`),
        api.get<StaffLeave[]>('/api/hr/leaves/my-requests'),
        api.get<Payslip[]>('/api/hr/payslips/my-payslips'),
        api.get<AttendanceCalendar>(`/api/hr/attendance/my-calendar?month=${month}`),
        api.get<GatePass[]>('/api/hr/gate-passes/my'),
      ]);
      setBalances(balanceData);
      setLeaves(leaveData);
      setPayslips(payslipData);
      setCalendar(calendarData);
      setGatePasses(gatePassData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load HR hub');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHr();
  }, [user?.user_id, month]);

  async function applyLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/hr/leaves/apply', form);
      toast.success('Leave request submitted');
      setForm({ leave_type: 'CL', start_date: '', end_date: '', reason: '' });
      await loadHr();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to apply leave');
    } finally {
      setSubmitting(false);
    }
  }

  async function requestGatePass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/hr/gate-passes', gatePassForm);
      toast.success('Gate pass request submitted');
      setGatePassForm({ out_time: '', expected_in_time: '', reason: '' });
      await loadHr();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to request gate pass');
    } finally {
      setSubmitting(false);
    }
  }

  function getDayState(date: string) {
    const d = new Date(`${date}T00:00:00`);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (weekend) return { label: 'Weekend', className: 'bg-slate-200' };
    const onLeave = calendar?.leaves.some((leave) => date >= leave.start_date && date <= leave.end_date);
    if (onLeave) return { label: 'On Leave', className: 'bg-amber-400' };
    const present = calendar?.attendance.some((row) => row.date === date && row.status === 'PRESENT');
    return present
      ? { label: 'Present', className: 'bg-emerald-500' }
      : { label: 'Absent', className: 'bg-red-500' };
  }

  const { leading, days } = monthDays(month);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">HR & Employee Hub</h2>
        <p className="mt-1 text-sm text-muted-foreground">Attendance calendar, leave management, gate passes, and payslips.</p>
      </section>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin" />
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Monthly Attendance Calendar</CardTitle>
              <CardDescription>Green: Present, Red: No punch, Yellow: Leave, Grey: Weekend</CardDescription>
            </div>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full sm:w-44" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted-foreground">
              {dayLabels.map((label) => <div key={label}>{label}</div>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: leading }).map((_, index) => <div key={`empty-${index}`} />)}
              {days.map((date) => {
                const state = getDayState(date);
                return (
                  <div key={date} className="rounded-xl border p-2 text-center">
                    <p className="text-xs font-semibold">{Number(date.slice(-2))}</p>
                    <span className={`mx-auto mt-1 block h-2.5 w-2.5 rounded-full ${state.className}`} title={state.label} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Leave Balance</CardTitle>
              <CardDescription>Remaining balance for this year</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center">
              {balances.map((balance) => {
                const remaining = Number(balance.entitled) - Number(balance.used);
                return (
                  <div key={balance.leave_type} className="rounded-xl bg-muted p-3">
                    <p className="text-xl font-black text-sgvu-navy">{remaining}</p>
                    <p className="text-xs text-muted-foreground">{balance.leave_type}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Apply for Leave</CardTitle>
              <CardDescription>Workflow: HOD → Dean → HR</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={applyLeave}>
                <select
                  className="h-11 rounded-xl border bg-background px-4 text-sm"
                  value={form.leave_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, leave_type: event.target.value }))}
                >
                  <option value="CL">Casual Leave</option>
                  <option value="SL">Sick Leave</option>
                  <option value="EL">Earned Leave</option>
                </select>
                <Input
                  required
                  type="date"
                  value={form.start_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
                />
                <Input
                  required
                  type="date"
                  value={form.end_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
                />
                <Input
                  placeholder="Reason"
                  value={form.reason}
                  onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                />
                <Button className="md:col-span-2" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Leave Request'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Digital Gate Pass</CardTitle>
              <CardDescription>Request permission for mid-duty exit.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={requestGatePass}>
                <Input
                  required
                  type="datetime-local"
                  value={gatePassForm.out_time}
                  onChange={(event) => setGatePassForm((prev) => ({ ...prev, out_time: event.target.value }))}
                />
                <Input
                  required
                  type="datetime-local"
                  value={gatePassForm.expected_in_time}
                  onChange={(event) => setGatePassForm((prev) => ({ ...prev, expected_in_time: event.target.value }))}
                />
                <Input
                  required
                  placeholder="Reason for going out"
                  value={gatePassForm.reason}
                  onChange={(event) => setGatePassForm((prev) => ({ ...prev, reason: event.target.value }))}
                />
                <Button className="w-full" type="submit" disabled={submitting}>
                  Submit Gate Pass
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Gate Passes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gatePasses.map((pass) => (
                <div key={pass.pass_id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                  <div>
                    <p className="font-medium">{new Date(pass.out_time).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{pass.reason}</p>
                  </div>
                  <Badge variant={pass.status === 'REJECTED' ? 'destructive' : 'secondary'}>{pass.status}</Badge>
                </div>
              ))}
              {gatePasses.length === 0 && <p className="text-sm text-muted-foreground">No gate pass requests yet.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My Leave Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {leaves.map((leave) => (
            <div key={leave.leave_id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <div>
                <p className="font-medium">{leave.leave_type}: {leave.start_date} to {leave.end_date}</p>
                <p className="text-xs text-muted-foreground">{leave.reason ?? 'No reason provided'}</p>
              </div>
              <Badge variant={leave.status === 'REJECTED' ? 'destructive' : 'secondary'}>{leave.status}</Badge>
            </div>
          ))}
          {!loading && leaves.length === 0 && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
          <CardDescription>Salary slip history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {payslips.map((payslip) => (
            <div key={payslip.payslip_id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <div>
                <p className="font-medium">{payslip.month} {payslip.year}</p>
                <p className="text-xs text-muted-foreground">Net Pay: ₹{Number(payslip.net_pay ?? 0).toLocaleString('en-IN')}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open(payslip.file_path, '_blank')}>
                Download
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
