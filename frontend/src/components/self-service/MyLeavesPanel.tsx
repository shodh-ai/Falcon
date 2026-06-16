'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPanel,
  FacultyEmptyState,
  FacultyStatCard,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import {
  workforceMinDate,
  formatWorkforceDateRange,
  leaveTypeLabel,
  leaveStatusLabel,
} from '@/lib/workforce-dates';
import { useShowMoreList, ShowMoreButton } from '@/components/self-service/ShowMoreList';

type Balance = { leave_type: string; entitled: string | number; used: string | number };
type Request = {
  leave_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'HR_APPROVED' || status === 'HOD_APPROVED') return 'default';
  if (status === 'PENDING') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

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
  const requestsList = useShowMoreList(requests, String(requests.length));

  return (
    <div className="space-y-4">
      {balances.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {balances.map((b) => (
            <FacultyStatCard
              key={b.leave_type}
              label={leaveTypeLabel(b.leave_type)}
              value={remaining(b)}
              sub={`Used ${Number(b.used)} of ${Number(b.entitled)}`}
              accent="navy"
            />
          ))}
        </div>
      )}

      <FacultyPanel title="Apply for leave" description="Submit casual, sick, or earned leave">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Leave type</span>
            <select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={form.leave_type}
              onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}
            >
              <option value="CL">Casual (CL)</option>
              <option value="SL">Sick (SL)</option>
              <option value="EL">Earned (EL)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">From</span>
            <Input
              type="date"
              min={workforceMinDate()}
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">To</span>
            <Input
              type="date"
              min={workforceMinDate()}
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Reason</span>
            <Input
              placeholder="Brief reason for leave"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              required
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit leave request
            </Button>
          </div>
        </form>
      </FacultyPanel>

      <FacultyPanel title="My requests" count={requests.length}>
        {requests.length === 0 ? (
          <FacultyEmptyState description="No leave requests yet." className="py-6" />
        ) : (
          <>
            <ul className="space-y-2">
              {requestsList.visible.map((r) => (
                <li
                  key={r.leave_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sgvu-navy">{leaveTypeLabel(r.leave_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWorkforceDateRange(r.start_date, r.end_date)}
                    </p>
                    {r.reason ? (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-md">{r.reason}</p>
                    ) : null}
                  </div>
                  <Badge variant={statusBadgeVariant(r.status)} className="shrink-0 text-[10px]">
                    {leaveStatusLabel(r.status)}
                  </Badge>
                </li>
              ))}
            </ul>
            <ShowMoreButton
              expanded={requestsList.expanded}
              hiddenCount={requestsList.hiddenCount}
              onClick={requestsList.toggle}
            />
          </>
        )}
      </FacultyPanel>
    </div>
  );
}
