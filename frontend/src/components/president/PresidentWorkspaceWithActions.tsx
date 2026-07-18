'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Check, RefreshCw, X } from 'lucide-react';
import { WorkspaceScaffold, type WorkspacePageConfig } from '@/components/workspaces/WorkspaceScaffold';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { usePresidentApi } from '@/lib/api/api.president';
import { useAuthedApi } from '@/lib/api';

type Row = Record<string, unknown>;

export function PresidentHrApprovalsWorkspace() {
  const president = usePresidentApi();
  const api = useAuthedApi();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  const loadRows = useCallback(async () => {
    try {
      const data = await api.get<Row>('/api/president/hr-approvals');
      setRows(Array.isArray(data.approvals) ? (data.approvals as Row[]) : []);
    } catch {
      setRows([]);
    }
  }, [api]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, reloadKey]);

  const review = async (requestId: string, approve: boolean) => {
    setBusyId(requestId);
    try {
      await president.reviewHrApproval(requestId, approve);
      toast.success(approve ? 'HR request approved' : 'HR request rejected');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusyId(null);
    }
  };

  const config: WorkspacePageConfig = {
    title: 'HR Operations & Appointments',
    subtitle: 'Operational review and sign-off on hiring, tenure, and staff disciplinary measures.',
    endpoint: '/api/president/hr-approvals',
    dataKey: 'approvals',
    summary: (data) => [
      { label: 'Pending Hires', value: Number((data as Row)?.pending_hires ?? 0) },
      { label: 'Tenure Reviews', value: Number((data as Row)?.tenure_reviews ?? 0) },
      { label: 'Disciplinary Cases', value: Number((data as Row)?.disciplinary_cases ?? 0) },
    ],
    columns: [
      { key: 'candidate', label: 'Candidate / Employee' },
      { key: 'department', label: 'Department' },
      { key: 'action', label: 'Action Requested' },
      { key: 'date_submitted', label: 'Date Submitted' },
    ],
  };

  return (
    <div className="space-y-4">
      <WorkspaceScaffold key={reloadKey} config={config} />
      {rows.length > 0 && (
        <div className="mx-auto max-w-7xl rounded-xl border bg-background p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-sgvu-navy">Executive decisions</p>
          <div className="space-y-2">
            {rows.map((row) => {
              const id = String(row.request_id ?? '');
              return (
                <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="text-sm">{String(row.candidate ?? row.action ?? 'Request')}</span>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyId === id} onClick={() => void review(id, true)}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === id} onClick={() => void review(id, false)}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function PresidentExecutiveOrdersWorkspace() {
  const president = usePresidentApi();
  const api = useAuthedApi();
  const [reloadKey, setReloadKey] = useState(0);
  const [orders, setOrders] = useState<Row[]>([]);
  const [form, setForm] = useState({
    subject: '',
    body: '',
    destination_module: 'REGISTRAR',
    order_type: 'DIRECTIVE',
  });
  const [busy, setBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.get<Row>('/api/president/executive-orders');
      setOrders(Array.isArray(data.orders) ? (data.orders as Row[]) : []);
    } catch {
      setOrders([]);
    }
  }, [api]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, reloadKey]);

  const createOrder = async () => {
    if (!form.subject.trim() || !form.body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    setBusy(true);
    try {
      await president.createExecutiveOrder(form);
      toast.success('Executive order issued');
      setForm({ subject: '', body: '', destination_module: 'REGISTRAR', order_type: 'DIRECTIVE' });
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not issue order');
    } finally {
      setBusy(false);
    }
  };

  const completeOrder = async (orderId: string) => {
    try {
      await president.updateExecutiveOrderStatus(orderId, 'COMPLETED');
      toast.success('Order marked completed');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const config: WorkspacePageConfig = {
    title: 'Disciplinary & Emergency Actions',
    subtitle: 'Official log of emergency decisions and major disciplinary actions.',
    endpoint: '/api/president/executive-orders',
    dataKey: 'orders',
    summary: (data) => [
      { label: 'Active Orders', value: Number((data as Row)?.active_suspensions ?? 0) },
      { label: 'In Progress', value: Number((data as Row)?.pending_ratifications ?? 0) },
      { label: 'Orders (YTD)', value: Number((data as Row)?.emergency_orders_ytd ?? 0) },
    ],
    columns: [
      { key: 'id', label: 'Order ID' },
      { key: 'date', label: 'Date' },
      { key: 'subject', label: 'Subject' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
  };

  const open = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(String(o.status ?? '')));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <WorkspaceScaffold key={reloadKey} config={config} />
      <div className="rounded-xl border bg-background p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-sgvu-navy">Issue executive order</p>
        <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <textarea
          className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Order body / directive"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <div className="flex flex-wrap gap-3">
          <Select
            className="h-10 rounded-md border px-3 text-sm"
            value={form.destination_module}
            onChange={(e) => setForm({ ...form, destination_module: e.target.value })}
          >
            {['REGISTRAR', 'DEAN', 'FINANCE', 'HR', 'IQAC', 'OPERATIONS'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Button disabled={busy} onClick={() => void createOrder()}>Issue order</Button>
        </div>
      </div>
      {open.length > 0 && (
        <div className="rounded-xl border bg-background p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold">Track open orders</p>
          {open.map((o) => (
            <div key={String(o.order_id ?? o.id)} className="mb-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="text-sm">{String(o.subject ?? o.id)}</span>
              <Button size="sm" variant="outline" onClick={() => void completeOrder(String(o.order_id ?? o.id))}>
                Mark completed
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PresidentConvocationWorkspace() {
  const president = usePresidentApi();
  const [pending, setPending] = useState<Row[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadPending = useCallback(async () => {
    try {
      const rows = await president.pendingRatifications();
      setPending(Array.isArray(rows) ? rows : []);
    } catch {
      setPending([]);
    }
  }, [president]);

  useEffect(() => {
    void loadPending();
  }, [loadPending, reloadKey]);

  const ratify = async (applicationId: string, approve: boolean) => {
    setBusyId(applicationId);
    try {
      await president.ratifyConvocation(applicationId, approve);
      toast.success(approve ? 'Convocation ratified — certificate released' : 'Ratification declined');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ratification failed');
    } finally {
      setBusyId(null);
    }
  };

  const config: WorkspacePageConfig = {
    title: 'Convocation & Degree Management',
    subtitle: 'Seasonal module for graduation eligibility and medal approvals.',
    endpoint: '/api/president/convocation',
    dataKey: 'graduates',
    summary: (data) => [
      { label: 'Eligible Graduates', value: Number((data as Row)?.eligible_graduates ?? 0) },
      { label: 'Medals Approved', value: Number((data as Row)?.medals_approved ?? 0) },
      { label: 'Pending Verifications', value: Number((data as Row)?.pending_verifications ?? 0) },
    ],
    columns: [
      { key: 'student_name', label: 'Student Name' },
      { key: 'program', label: 'Program' },
      { key: 'honors', label: 'Honors / Medals' },
    ],
  };

  return (
    <div className="space-y-6">
      <WorkspaceScaffold key={reloadKey} config={config} />
      <div className="mx-auto max-w-7xl rounded-xl border bg-background p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-sgvu-navy">Pending President ratification</p>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications awaiting ratification.</p>
        ) : (
          pending.map((row) => {
            const id = String(row.application_id ?? '');
            return (
              <div key={id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{String(row.student_name ?? 'Student')}</p>
                  <p className="text-xs text-muted-foreground">{String(row.program ?? 'Programme')}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === id} onClick={() => void ratify(id, true)}>Ratify</Button>
                  <Button size="sm" variant="outline" disabled={busyId === id} onClick={() => void ratify(id, false)}>Decline</Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function PresidentComplianceWorkspace() {
  const president = usePresidentApi();
  const api = useAuthedApi();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  const loadRows = useCallback(async () => {
    try {
      const data = await api.get<Row>('/api/president/compliance');
      setRows(Array.isArray(data.defaulting_units) ? (data.defaulting_units as Row[]) : []);
    } catch {
      setRows([]);
    }
  }, [api]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, reloadKey]);

  const runAction = async (
    assignmentId: string,
    action: 'ASSIGN_INVESTIGATION' | 'ESCALATE_DEPARTMENT' | 'REQUEST_REPORT' | 'MARK_REVIEWED',
  ) => {
    setBusyId(assignmentId);
    try {
      await president.complianceAction(assignmentId, action);
      toast.success('Compliance action recorded');
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const config: WorkspacePageConfig = {
    title: 'Compliance View',
    subtitle: 'IQAC defaulting units visible to leadership with executive intervention actions.',
    endpoint: '/api/president/compliance',
    dataKey: 'defaulting_units',
    columns: [
      { key: 'task', label: 'Task' },
      { key: 'assigned_to', label: 'Owner' },
      { key: 'department', label: 'Department' },
      { key: 'due_date', label: 'Due Date' },
    ],
  };

  const actions = [
    ['ASSIGN_INVESTIGATION', 'Investigate'],
    ['ESCALATE_DEPARTMENT', 'Escalate'],
    ['REQUEST_REPORT', 'Request report'],
    ['MARK_REVIEWED', 'Mark reviewed'],
  ] as const;

  return (
    <div className="space-y-4">
      <WorkspaceScaffold key={reloadKey} config={config} />
      {rows.length > 0 && (
        <div className="mx-auto max-w-7xl rounded-xl border bg-background p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-sgvu-navy">Executive compliance actions</p>
          {rows.slice(0, 10).map((row) => {
            const id = String(row.assignment_id ?? '');
            return (
              <div key={id} className="mb-3 rounded-lg border px-3 py-2">
                <p className="text-sm font-medium">{String(row.task ?? 'Task')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {actions.map(([action, label]) => (
                    <Button
                      key={action}
                      size="sm"
                      variant="outline"
                      disabled={busyId === id}
                      onClick={() => void runAction(id, action)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
