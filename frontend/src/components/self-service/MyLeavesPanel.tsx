'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { workforceMinDate } from '@/lib/workforce-dates';

type Balance = { leave_type: string; entitled: string | number; used: string | number };
type Request = {
  leave_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

export function MyLeavesPanel() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [form, setForm] = useState({ leave_type: 'CL', start_date: '', end_date: '', reason: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    if (!user?.user_id) return;
    const [b, r] = await Promise.all([
      api.get<Balance[]>('/api/hr/leaves/my-balances'),
      api.get<Request[]>('/api/hr/workforce/my-requests'),
    ]);
    setBalances(b);
    setRequests(r.filter((x) => x.leave_type));
  }

  useEffect(() => {
    void load();
  }, [user?.user_id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/api/hr/workforce/requests', {
        request_type: 'LEAVE',
        ...form,
      });
      toast.success('Leave submitted');
      setForm({ leave_type: 'CL', start_date: '', end_date: '', reason: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  const remaining = (b: Balance) => Math.max(0, Number(b.entitled) - Number(b.used));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {balances.map((b) => (
          <Card key={b.leave_type}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{b.leave_type}</p>
              <p className="text-2xl font-bold text-sgvu-navy">{remaining(b)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply for leave</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={form.leave_type}
              onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}
            >
              <option value="CL">Casual (CL)</option>
              <option value="SL">Sick (SL)</option>
              <option value="EL">Earned (EL)</option>
            </select>
            <Input
              type="date"
              min={workforceMinDate()}
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              required
            />
            <Input
              type="date"
              min={workforceMinDate()}
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              required
            />
            <Input
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              required
            />
            <Button type="submit" className="sm:col-span-2" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.map((r) => (
            <div key={r.leave_id} className="flex items-center justify-between rounded border p-3 text-sm">
              <span>
                {r.leave_type}: {r.start_date} – {r.end_date}
              </span>
              <Badge variant="secondary">{r.status}</Badge>
            </div>
          ))}
          {!requests.length && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
