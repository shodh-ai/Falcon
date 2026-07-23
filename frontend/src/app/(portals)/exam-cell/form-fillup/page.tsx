'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type FormWindow = {
  window_id: string;
  title: string;
  semester: number;
  program_label: string | null;
  opens_at: string;
  closes_at: string;
  status: string;
  session_name?: string | null;
};

type Registration = {
  registration_id: string;
  student_name: string;
  enrollment_number: string | null;
  semester: number;
  fee_status: string;
  status: string;
  eligibility_snapshot: { eligible?: boolean; block_reasons?: string[] };
  window_title?: string | null;
};

export default function ExamCellFormFillupPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.roles ?? user?.role, 'manage_sessions');
  const [windows, setWindows] = useState<FormWindow[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selectedWindow, setSelectedWindow] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    semester: '4',
    program_label: 'B.Tech',
    opens_at: '',
    closes_at: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, r] = await Promise.all([
        api.get<FormWindow[]>('/api/exam-cell/form-windows'),
        api.get<Registration[]>(
          `/api/exam-cell/registrations${selectedWindow ? `?window_id=${selectedWindow}` : ''}${statusFilter ? `${selectedWindow ? '&' : '?'}status=${statusFilter}` : ''}`,
        ),
      ]);
      setWindows(w);
      setRegistrations(r);
      if (!selectedWindow && w[0]) setSelectedWindow(w[0].window_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load form fill-up desk');
    } finally {
      setLoading(false);
    }
  }, [api, selectedWindow, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function createWindow() {
    if (!form.title.trim() || !form.opens_at || !form.closes_at) {
      toast.error('Title and dates are required');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/exam-cell/form-windows', {
        ...form,
        semester: Number(form.semester),
      });
      toast.success('Form window created');
      setForm((f) => ({ ...f, title: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function setWindowStatus(windowId: string, status: 'OPEN' | 'CLOSED') {
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/form-windows/${windowId}/status`, { status });
      toast.success(`Window ${status.toLowerCase()}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function syncRegistrations() {
    if (!selectedWindow) return;
    const win = windows.find((w) => w.window_id === selectedWindow);
    if (!win) return;
    setBusy(true);
    try {
      const res = await api.post<{ created: number; total_students: number }>(
        `/api/exam-cell/form-windows/${selectedWindow}/sync-registrations`,
        { semester: win.semester },
      );
      toast.success(`Synced ${res.created} registrations from ${res.total_students} students`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function reviewRegistration(id: string, status: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/registrations/${id}/review`, { status });
      toast.success(`Registration ${status.toLowerCase()}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  }

  const regColumns: DataTableColumn<Registration>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'fee', header: 'Fee', render: (r) => <Badge variant={r.fee_status === 'PAID' ? 'default' : 'secondary'}>{r.fee_status}</Badge> },
    { key: 'eligibility', header: 'Eligibility', render: (r) => (
      <Badge variant={r.eligibility_snapshot?.eligible !== false ? 'default' : 'destructive'}>
        {r.eligibility_snapshot?.eligible !== false ? 'Eligible' : 'Blocked'}
      </Badge>
    ) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant="outline">{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => r.status === 'PENDING' && canManage ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void reviewRegistration(r.registration_id, 'APPROVED')}>Approve</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reviewRegistration(r.registration_id, 'REJECTED')}>Reject</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="form-fillup" actions={
            <Button
              variant="outline"
              size="sm"
              className="bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          } />
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="py-3 text-sm">
          <strong>Why this page?</strong> Form Fill-up Desk opens registration windows so students can apply for semester exams online.
          You create a window (dates + semester), sync registrations from enrolled students, then approve or reject each application before hall ticket workflow begins.
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create form window</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-h-[4.5rem] flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-bold leading-5 text-sgvu-navy">Window title</label>
                <Input
                  className="h-10"
                  placeholder="e.g. End Semester Form Fill-up — Sem 4"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label className="text-sm font-bold leading-5 text-sgvu-navy">Semester</label>
                <Input
                  className="h-10"
                  type="number"
                  placeholder="4"
                  value={form.semester}
                  onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label className="text-sm font-bold leading-5 text-sgvu-navy">Program</label>
                <Input
                  className="h-10"
                  placeholder="B.Tech"
                  value={form.program_label}
                  onChange={(e) => setForm((f) => ({ ...f, program_label: e.target.value }))}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label className="text-sm font-bold leading-5 text-sgvu-navy">Opens at</label>
                <Input
                  className="h-10"
                  type="datetime-local"
                  value={form.opens_at}
                  onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))}
                />
              </div>
              <div className="flex min-h-[4.5rem] flex-col gap-1.5">
                <label className="text-sm font-bold leading-5 text-sgvu-navy">Closes at</label>
                <Input
                  className="h-10"
                  type="datetime-local"
                  value={form.closes_at}
                  onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-center pt-1">
              <Button onClick={() => void createWindow()} disabled={busy}>
                {busy ? 'Creating…' : 'Create window'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Active form windows</CardTitle>
          {canManage && selectedWindow ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void syncRegistrations()}>Sync student registrations</Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No form windows configured. Run database migration or create one above.</p>
          ) : windows.map((w) => (
            <div key={w.window_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div>
                <p className="font-medium">{w.title}</p>
                <p className="text-xs text-muted-foreground">Sem {w.semester} · {w.program_label ?? 'All programs'} · {new Date(w.opens_at).toLocaleDateString()} – {new Date(w.closes_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{w.status}</Badge>
                {canManage && w.status === 'DRAFT' ? <Button size="sm" variant="outline" onClick={() => void setWindowStatus(w.window_id, 'OPEN')}>Open</Button> : null}
                {canManage && w.status === 'OPEN' ? <Button size="sm" variant="outline" onClick={() => void setWindowStatus(w.window_id, 'CLOSED')}>Close</Button> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Registration queue</CardTitle>
          <div className="flex gap-2">
            <Select className="rounded-md border px-2 py-1 text-sm" value={selectedWindow} onChange={(e) => setSelectedWindow(e.target.value)}>
              <option value="">All windows</option>
              {windows.map((w) => <option key={w.window_id} value={w.window_id}>{w.title}</option>)}
            </Select>
            <Select className="rounded-md border px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={regColumns} rows={registrations} rowKey={(r) => r.registration_id} emptyMessage="No registrations yet. Open a window and sync students." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
