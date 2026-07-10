'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPanel,
  FacultyEmptyState,
  FacultyStatCard,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/api-base-url';
import { getSubdomainFromClient } from '@/lib/tenant';
import {
  workforceMinDate,
  formatWorkforceDateRange,
  leaveTypeLabel,
  leaveStatusLabel,
} from '@/lib/workforce-dates';
import { useShowMoreList, ShowMoreButton } from '@/components/self-service/ShowMoreList';
import { ProxyTeachingDialog } from '@/components/faculty/ProxyTeachingDialog';

type Balance = { leave_type: string; entitled: string | number; used: string | number };
type Request = {
  leave_id: string;
  leave_type: string;
  request_type?: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

type ApplyMode = 'LEAVE' | 'ON_DUTY';

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'HR_APPROVED' || status === 'HOD_APPROVED') return 'default';
  if (status === 'PENDING') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

export function MyLeavesPanel() {
  const api = useAuthedApi();
  const { user, token } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [applyMode, setApplyMode] = useState<ApplyMode>('LEAVE');
  const [form, setForm] = useState({ leave_type: 'CL', start_date: '', end_date: '', reason: '' });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proxyLeaveRange, setProxyLeaveRange] = useState<{ start: string; end: string } | null>(null);

  async function load() {
    if (!user?.user_id) return;
    const [b, r] = await Promise.all([
      api.get<Balance[]>('/api/hr/leaves/my-balances'),
      api.get<Request[]>('/api/hr/workforce/my-requests'),
    ]);
    setBalances(b);
    setRequests(r);
  }

  useEffect(() => {
    void load();
  }, [user?.user_id]);

  async function uploadAttachment(file: File): Promise<string | undefined> {
    if (!token) return undefined;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${getApiBaseUrl()}/uploads/single`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
      body: formData,
    });
    if (!res.ok) throw new Error('Attachment upload failed');
    const json = await res.json();
    return json.path ?? json.url;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let supporting_doc_urls: string[] | undefined;
      if (attachment) {
        const path = await uploadAttachment(attachment);
        if (path) supporting_doc_urls = [path];
      }
      await api.post('/api/hr/workforce/requests', {
        request_type: applyMode,
        leave_type: applyMode === 'ON_DUTY' ? 'OD' : form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason,
        supporting_doc_urls,
      });
      toast.success(applyMode === 'ON_DUTY' ? 'On Duty (OD) submitted' : 'Leave submitted');
      setForm({ leave_type: 'CL', start_date: '', end_date: '', reason: '' });
      setAttachment(null);
      if (applyMode === 'LEAVE') {
        setProxyLeaveRange({ start: form.start_date, end: form.end_date });
      }
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

      <FacultyPanel title="Apply leave / On Duty" description="Zimyo-style requests — CL, SL, EL, RH, or OD with optional proof">
        <div className="mb-3 flex gap-2">
          <Button type="button" size="sm" variant={applyMode === 'LEAVE' ? 'default' : 'outline'} onClick={() => setApplyMode('LEAVE')}>
            Leave
          </Button>
          <Button type="button" size="sm" variant={applyMode === 'ON_DUTY' ? 'default' : 'outline'} onClick={() => setApplyMode('ON_DUTY')}>
            On Duty (OD)
          </Button>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {applyMode === 'LEAVE' && (
            <label className="text-sm sm:col-span-2 lg:col-span-1">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Leave type</span>
              <Select
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                value={form.leave_type}
                onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}
              >
                <option value="CL">Casual (CL)</option>
                <option value="SL">Sick (SL)</option>
                <option value="EL">Earned (EL)</option>
                <option value="RH">Restricted Holiday (RH)</option>
              </Select>
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">From</span>
            <Input type="date" min={workforceMinDate()} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">To</span>
            <Input type="date" min={workforceMinDate()} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Reason</span>
            <Input placeholder="Brief reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} required />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 flex items-center gap-1 font-medium text-sgvu-navy">
              <Paperclip className="h-3.5 w-3.5" /> Supporting document (optional)
            </span>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e: ChangeEvent<HTMLInputElement>) => setAttachment(e.target.files?.[0] ?? null)} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit {applyMode === 'ON_DUTY' ? 'OD' : 'leave'}
            </Button>
          </div>
        </form>
        {proxyLeaveRange ? (
          <ProxyTeachingDialog startDate={proxyLeaveRange.start} endDate={proxyLeaveRange.end} onDone={() => setProxyLeaveRange(null)} />
        ) : null}
      </FacultyPanel>

      <FacultyPanel title="My requests" count={requests.length}>
        {requests.length === 0 ? (
          <FacultyEmptyState description="No leave requests yet." className="py-6" />
        ) : (
          <>
            <ul className="space-y-2">
              {requestsList.visible.map((r) => (
                <li key={r.leave_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-sgvu-navy">
                      {r.request_type === 'ON_DUTY' ? 'On Duty (OD)' : leaveTypeLabel(r.leave_type)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatWorkforceDateRange(r.start_date, r.end_date)}</p>
                    {r.reason ? <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-md">{r.reason}</p> : null}
                  </div>
                  <Badge variant={statusBadgeVariant(r.status)} className="shrink-0 text-[10px]">{leaveStatusLabel(r.status)}</Badge>
                </li>
              ))}
            </ul>
            <ShowMoreButton expanded={requestsList.expanded} hiddenCount={requestsList.hiddenCount} onClick={requestsList.toggle} />
          </>
        )}
      </FacultyPanel>
    </div>
  );
}
