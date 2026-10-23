'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { isEmptyArray, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import {
  facultyDemoLeaveBalances,
  facultyDemoLeaveRequests,
} from '@/lib/mock/faculty-portal-demo';
import { calendarDateKey } from '@/lib/faculty/calendar-date';

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
const EMPTY_FORM = { leave_type: 'CL', start_date: '', end_date: '', reason: '' };

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'HR_APPROVED' || status === 'HOD_APPROVED') return 'default';
  if (status === 'PENDING') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

export function MyLeavesPanel() {
  const api = useAuthedApi();
  const { user, token } = useAuth();
  const scope = useMemo(() => ({ api, userId: user?.user_id, token }), [api, user?.user_id, token]);
  const [workspace, setWorkspace] = useState({ scope, revision: 0 });
  if (workspace.scope !== scope) setWorkspace({ scope, revision: workspace.revision + 1 });
  return <MyLeavesWorkspace key={workspace.revision} scope={scope} />;
}

function MyLeavesWorkspace({ scope }: { scope: { api: ReturnType<typeof useAuthedApi>; userId?: string; token: string | null } }) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [applyMode, setApplyMode] = useState<ApplyMode>('LEAVE');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(scope.userId && scope.token));
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [proxyLeaveRange, setProxyLeaveRange] = useState<{ start: string; end: string } | null>(null);
  const mounted = useRef(false);
  const activeScope = useRef(scope);
  const loadRequest = useRef(0);
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadedAttachment = useRef<{ file: File; path: string; scope: typeof scope } | null>(null);
  const unavailable = isSubmitting || !scope.userId || !scope.token;

  const clearDraft = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setAttachment(null);
    uploadedAttachment.current = null;
    if (fileInput.current) fileInput.current.value = '';
  }, []);

  const load = useCallback(async (afterSave = false) => {
    const requestId = ++loadRequest.current;
    if (!scope.userId || !scope.token) return;
    const [balanceResult, requestResult] = await Promise.allSettled([
      scope.api.get<Balance[]>('/api/hr/leaves/my-balances').then((rows) => {
        if (!Array.isArray(rows)) throw new Error('Invalid leave balances response');
        return rows;
      }),
      scope.api.get<Request[]>('/api/hr/workforce/my-requests').then((rows) => {
        if (!Array.isArray(rows)) throw new Error('Invalid leave requests response');
        return rows;
      }),
    ]);
    if (!mounted.current || activeScope.current !== scope || requestId !== loadRequest.current) return;
    setBalanceError(null);
    setRequestsError(null);
    setRefreshWarning(null);

    if (balanceResult.status === 'fulfilled') {
      const b = balanceResult.value;
      setBalances(withFacultyDemoFallback(b, facultyDemoLeaveBalances() as Balance[], isEmptyArray));
    } else {
      const fallback = withFacultyDemoFallback([], facultyDemoLeaveBalances() as Balance[], isEmptyArray);
      if (fallback.length) setBalances(fallback);
      else setBalanceError(balanceResult.reason instanceof Error ? balanceResult.reason.message : 'Could not load leave balances');
    }

    if (requestResult.status === 'fulfilled') {
      const r = requestResult.value;
      setRequests(withFacultyDemoFallback(r, facultyDemoLeaveRequests() as Request[], isEmptyArray));
      setRequestsLoaded(true);
    } else {
      const fallback = withFacultyDemoFallback([], facultyDemoLeaveRequests() as Request[], isEmptyArray);
      if (fallback.length) { setRequests(fallback); setRequestsLoaded(true); }
      else setRequestsError(requestResult.reason instanceof Error ? requestResult.reason.message : 'Could not load leave requests');
    }
    if (afterSave && (balanceResult.status === 'rejected' || requestResult.status === 'rejected')) {
      setRefreshWarning('Request saved, but some leave information could not be refreshed.');
    }
    setLoading(false);
  }, [scope]);

  useLayoutEffect(() => {
    mounted.current = true;
    activeScope.current = scope;
    return () => { mounted.current = false; loadRequest.current += 1; };
  }, [scope]);

  useEffect(() => {
    // Fetch this workspace's balances and requests; guarded responses populate state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function uploadAttachment(file: File): Promise<string> {
    if (!scope.token) throw new Error('Sign in before uploading a supporting document');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${getApiBaseUrl()}/uploads/single`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${scope.token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
      body: formData,
    });
    if (!res.ok) throw new Error('Attachment upload failed');
    const json = await res.json();
    const path = [json?.url, json?.path].find((value) => typeof value === 'string' && value.trim())?.trim();
    if (!path) throw new Error('Attachment upload returned no file location. Please retry.');
    return path;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || unavailable) return;
    if (!form.reason.trim()) {
      toast.error('Enter a reason for your request');
      return;
    }
    if (!form.start_date || !form.end_date || calendarDateKey(form.start_date) !== form.start_date || calendarDateKey(form.end_date) !== form.end_date) {
      toast.error('Enter valid start and end dates');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('The end date cannot be before the start date');
      return;
    }
    submitting.current = true;
    setIsSubmitting(true);
    setSaveError(null);
    try {
      let supporting_doc_urls: string[] | undefined;
      if (attachment) {
        let path = uploadedAttachment.current?.file === attachment && uploadedAttachment.current.scope === scope
          ? uploadedAttachment.current.path
          : undefined;
        if (!path) {
          path = await uploadAttachment(attachment);
          if (!mounted.current || activeScope.current !== scope) return;
          uploadedAttachment.current = { file: attachment, path, scope };
        }
        supporting_doc_urls = [path];
      }
      const created = await scope.api.post<Request>('/api/hr/workforce/requests', {
        request_type: applyMode,
        leave_type: applyMode === 'ON_DUTY' ? 'OD' : form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim(),
        supporting_doc_urls,
      });
      if (!mounted.current || activeScope.current !== scope) return;
      toast.success(
        applyMode === 'ON_DUTY'
          ? 'On Duty request sent for approval'
          : 'Leave request sent to your HOD/reporting officer',
      );
      if (created?.leave_id) {
        setRequests((rows) => [created, ...rows.filter((row) => row.leave_id !== created.leave_id)]);
        setRequestsLoaded(true);
      }
      clearDraft();
      if (applyMode === 'LEAVE') {
        setProxyLeaveRange({ start: form.start_date, end: form.end_date });
      }
      await load(true);
    } catch (err) {
      if (!mounted.current || activeScope.current !== scope) return;
      const message = err instanceof Error ? err.message : 'Submit failed';
      setSaveError(message);
      toast.error(message);
    } finally {
      if (activeScope.current === scope) { submitting.current = false; if (mounted.current) setIsSubmitting(false); }
    }
  }

  const remaining = (b: Balance) => Math.max(0, Number(b.entitled) - Number(b.used));
  const requestsList = useShowMoreList(requests, String(requests.length));

  return (
    <div className="space-y-4">
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading leave information…</p> : null}
      {balanceError || requestsError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>
            {refreshWarning ? <p>{refreshWarning}</p> : null}
            {balanceError ? <p>Leave balances: {balanceError}</p> : null}
            {requestsError ? <p>Leave requests: {requestsError}</p> : null}
            <p>You can still submit a request, or retry loading your information.</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={loading || isSubmitting} onClick={() => { setLoading(true); setBalanceError(null); setRequestsError(null); void load(); }}>
            Retry leave information
          </Button>
        </div>
      ) : null}
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
          <Button type="button" size="sm" disabled={unavailable} variant={applyMode === 'LEAVE' ? 'default' : 'outline'} onClick={() => setApplyMode('LEAVE')}>
            Leave
          </Button>
          <Button type="button" size="sm" disabled={unavailable} variant={applyMode === 'ON_DUTY' ? 'default' : 'outline'} onClick={() => setApplyMode('ON_DUTY')}>
            On Duty (OD)
          </Button>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {applyMode === 'LEAVE' && (
            <label className="text-sm sm:col-span-2 lg:col-span-1">
              <span className="mb-1.5 block font-medium text-sgvu-navy">Leave type</span>
              <Select
                disabled={unavailable}
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
            <Input type="date" disabled={unavailable} min={workforceMinDate()} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">To</span>
            <Input type="date" disabled={unavailable} min={form.start_date || workforceMinDate()} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Reason</span>
            <Input placeholder="Brief reason" disabled={unavailable} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} required />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 flex items-center gap-1 font-medium text-sgvu-navy">
              <Paperclip className="h-3.5 w-3.5" /> Supporting document (optional)
            </span>
            <Input ref={fileInput} type="file" disabled={unavailable} accept=".pdf,.jpg,.jpeg,.png" onChange={(e: ChangeEvent<HTMLInputElement>) => { setAttachment(e.target.files?.[0] ?? null); uploadedAttachment.current = null; }} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={unavailable}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit {applyMode === 'ON_DUTY' ? 'OD' : 'leave'}
            </Button>
          </div>
        </form>
        {saveError ? <p role="alert" className="mt-3 text-sm text-destructive">{saveError}</p> : null}
        {proxyLeaveRange ? (
          <ProxyTeachingDialog startDate={proxyLeaveRange.start} endDate={proxyLeaveRange.end} onDone={() => setProxyLeaveRange(null)} />
        ) : null}
      </FacultyPanel>

      <FacultyPanel title="My requests" count={requestsLoaded ? requests.length : undefined}>
        {!scope.userId || !scope.token ? <p className="text-sm text-muted-foreground">Sign in to view your leave requests.</p> : null}
        {!loading && !requestsError && requestsLoaded && requests.length === 0 ? (
          <FacultyEmptyState description="No leave requests yet." className="py-6" />
        ) : requests.length > 0 ? (
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
        ) : null}
      </FacultyPanel>
    </div>
  );
}
