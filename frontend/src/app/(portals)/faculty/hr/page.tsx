'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { HrAttendanceCalendar } from '@/components/hr/HrAttendanceCalendar';
import { workforceDateInputProps, workforceMinDate } from '@/lib/workforce-dates';

type TodayWidget = {
  shift: { start: string; end: string; progress_percent: number };
  display: { in_time: string; out_time: string; hours_worked_today: string };
  status: string;
};

type Balance = { leave_type: string; entitled: string | number; used: string | number };
type Holiday = { holiday_id: string; title: string; date: string; type: string; description?: string };
type WorkforceRequest = {
  leave_id: string;
  request_type: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

export default function FacultyHrHubPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<TodayWidget | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [holidays, setHolidays] = useState<{ mandatory: Holiday[]; restricted: Holiday[] }>({
    mandatory: [],
    restricted: [],
  });
  const [requests, setRequests] = useState<WorkforceRequest[]>([]);
  const [modal, setModal] = useState<'LEAVE' | 'ON_DUTY' | 'REGULARIZATION' | 'COMP_OFF_CREDIT' | 'GATE_PASS' | null>(null);
  const [form, setForm] = useState({
    leave_type: 'CL',
    start_date: '',
    end_date: '',
    regularization_date: '',
    missed_punch_type: 'BOTH' as 'IN' | 'OUT' | 'BOTH',
    reason: '',
    out_time: '',
    expected_in_time: '',
    gate_purpose: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const [widget, balanceData, holidayData, reqData] = await Promise.all([
        api.get<TodayWidget>('/api/hr/workforce/today'),
        api.get<Balance[]>('/api/hr/leaves/my-balances'),
        api.get<{ mandatory: Holiday[]; restricted: Holiday[] }>('/api/hr/holidays'),
        api.get<WorkforceRequest[]>('/api/hr/workforce/my-requests'),
      ]);
      setToday(widget);
      setBalances(balanceData);
      setHolidays(holidayData);
      setRequests(reqData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load HR hub');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user?.user_id]);

  async function submitRequest(e: FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setIsSubmitting(true);
    try {
      if (modal === 'GATE_PASS') {
        await api.post('/api/hr/gate-passes', {
          out_time: form.out_time,
          expected_in_time: form.expected_in_time,
          reason: form.gate_purpose.trim(),
        });
        toast.success('Gate pass submitted to your HOD');
      } else {
        await api.post('/api/hr/workforce/requests', {
          request_type: modal,
          leave_type: form.leave_type,
          start_date: form.start_date || form.regularization_date,
          end_date: form.end_date || form.regularization_date,
          regularization_date: modal === 'REGULARIZATION' ? form.regularization_date : undefined,
          missed_punch_type: modal === 'REGULARIZATION' ? form.missed_punch_type : undefined,
          reason: form.reason,
        });
        toast.success('Request submitted to your reporting officer');
      }
      setModal(null);
      setForm({
        leave_type: 'CL',
        start_date: '',
        end_date: '',
        regularization_date: '',
        missed_punch_type: 'BOTH',
        reason: '',
        out_time: '',
        expected_in_time: '',
        gate_purpose: '',
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  const remaining = (b: Balance) => Math.max(0, Number(b.entitled) - Number(b.used));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">HR & Employee Hub</h2>
        <p className="text-sm text-muted-foreground">
          Biometric attendance (read-only), leave balances, holidays, and formal requests.
        </p>
      </section>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {!loading && today && (
        <Card className="border-sgvu-gold/30 bg-gradient-to-br from-slate-50 to-white">
          <CardHeader>
            <CardTitle>Let&apos;s get to work</CardTitle>
            <CardDescription>
              Shift {today.shift.start} – {today.shift.end} · Biometric sync (read-only)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={today.shift.progress_percent} className="h-3" />
            <p className="text-lg font-semibold text-sgvu-navy">
              In: {today.display.in_time} | Out: {today.display.out_time} | Hours today:{' '}
              {today.display.hours_worked_today}
            </p>
            <Badge variant="outline">{today.status.replace('_', ' ')}</Badge>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action center</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => setModal('LEAVE')}>Apply leave</Button>
            <Button variant="outline" onClick={() => setModal('GATE_PASS')}>
              Request Gate Pass (Mid-Duty Exit)
            </Button>
            <Button variant="outline" onClick={() => setModal('ON_DUTY')}>
              Apply OD (on duty)
            </Button>
            <Button variant="outline" onClick={() => setModal('REGULARIZATION')}>
              Regularize attendance
            </Button>
            <Button variant="outline" onClick={() => setModal('COMP_OFF_CREDIT')}>
              Request comp-off
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leave balances</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {balances.map((b) => (
                <div key={b.leave_type} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{b.leave_type}</p>
                  <p className="text-2xl font-bold text-sgvu-navy">{remaining(b)}</p>
                  <p className="text-xs text-muted-foreground">
                    of {b.entitled} · used {b.used}
                  </p>
                </div>
              ))}
              {!balances.length && (
                <p className="text-sm text-muted-foreground col-span-2">No balances on file.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Holiday calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-sgvu-navy">Mandatory</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {holidays.mandatory.map((h) => (
                    <li key={h.holiday_id}>
                      {new Date(h.date).toLocaleDateString()} — {h.title}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-sgvu-navy">Restricted (RH)</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {holidays.restricted.map((h) => (
                    <li key={h.holiday_id}>
                      {new Date(h.date).toLocaleDateString()} — {h.title}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && <HrAttendanceCalendar mode="self" title="My attendance" />}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.slice(0, 8).map((r) => (
              <div key={r.leave_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{r.request_type.replace('_', ' ')} · {r.leave_type}</p>
                  <p className="text-muted-foreground">
                    {r.start_date}
                    {r.end_date !== r.start_date ? ` – ${r.end_date}` : ''}
                  </p>
                </div>
                <Badge variant="secondary">{r.status}</Badge>
              </div>
            ))}
            {!requests.length && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          </CardContent>
        </Card>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">
                {modal === 'LEAVE' && 'Apply leave'}
                {modal === 'GATE_PASS' && 'Request gate pass (mid-duty exit)'}
                {modal === 'ON_DUTY' && 'Apply on duty (OD)'}
                {modal === 'REGULARIZATION' && 'Regularize attendance'}
                {modal === 'COMP_OFF_CREDIT' && 'Request comp-off credit'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitRequest} className="space-y-3">
                {modal === 'GATE_PASS' && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground">Out time</label>
                      <Input
                        type="datetime-local"
                        required
                        value={form.out_time}
                        onChange={(e) => setForm((f) => ({ ...f, out_time: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Expected in time</label>
                      <Input
                        type="datetime-local"
                        required
                        value={form.expected_in_time}
                        onChange={(e) => setForm((f) => ({ ...f, expected_in_time: e.target.value }))}
                      />
                    </div>
                    <Input
                      placeholder="Purpose"
                      required
                      value={form.gate_purpose}
                      onChange={(e) => setForm((f) => ({ ...f, gate_purpose: e.target.value }))}
                    />
                  </>
                )}
                {modal === 'LEAVE' && (
                  <select
                    className="w-full rounded-md border px-2 py-2 text-sm"
                    value={form.leave_type}
                    onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}
                  >
                    <option value="CL">Casual (CL)</option>
                    <option value="SL">Sick (SL)</option>
                    <option value="EL">Earned (EL)</option>
                  </select>
                )}
                {modal === 'REGULARIZATION' ? (
                  <>
                    <Input
                      type="date"
                      required
                      min={workforceMinDate()}
                      value={form.regularization_date}
                      onChange={(e) => setForm((f) => ({ ...f, regularization_date: e.target.value }))}
                    />
                    <select
                      className="w-full rounded-md border px-2 py-2 text-sm"
                      value={form.missed_punch_type}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, missed_punch_type: e.target.value as 'IN' | 'OUT' | 'BOTH' }))
                      }
                    >
                      <option value="IN">Missed punch IN</option>
                      <option value="OUT">Missed punch OUT</option>
                      <option value="BOTH">Missed both</option>
                    </select>
                  </>
                ) : modal !== 'GATE_PASS' ? (
                  <>
                    <Input
                      type="date"
                      required
                      {...workforceDateInputProps(modal)}
                      value={form.start_date}
                      onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    />
                    {modal !== 'COMP_OFF_CREDIT' && (
                      <Input
                        type="date"
                        required
                        {...workforceDateInputProps(modal)}
                        value={form.end_date}
                        onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                      />
                    )}
                  </>
                ) : null}
                {modal !== 'GATE_PASS' && (
                  <Input
                    placeholder="Reason"
                    required
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setModal(null)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
