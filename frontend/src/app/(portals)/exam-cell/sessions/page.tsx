'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

type ExamSession = {
  session_id: string;
  academic_year: string;
  session_name: string;
  cycle_type: string;
  semester: number | null;
  program_label: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

const CYCLE_TYPES = [
  'ODD_SEMESTER', 'EVEN_SEMESTER', 'MID_SEMESTER', 'END_SEMESTER',
  'SUPPLEMENTARY', 'IMPROVEMENT', 'BACK_PAPER', 'PRACTICAL', 'VIVA',
];

function formatSessionDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ExamCellSessionsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.roles ?? user?.role, 'manage_sessions');
  const [rows, setRows] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updatingSession, setUpdatingSession] = useState<string | null>(null);
  const createPending = useRef(false);
  const statusPending = useRef(false);
  const [form, setForm] = useState({
    academic_year: '2025-26',
    session_name: '',
    cycle_type: 'END_SEMESTER',
    semester: '4',
    program_label: 'B.Tech',
    start_date: '',
    end_date: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.get<ExamSession[]>('/api/exam-cell/sessions'));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load sessions';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function createSession() {
    if (createPending.current) return;
    if (!form.session_name.trim()) {
      toast.error('Session name is required');
      return;
    }
    createPending.current = true;
    setCreating(true);
    try {
      await api.post('/api/exam-cell/sessions', {
        ...form,
        semester: Number(form.semester),
      });
      toast.success('Exam session created');
      setForm((f) => ({ ...f, session_name: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      createPending.current = false;
      setCreating(false);
    }
  }

  async function setStatus(sessionId: string, status: string) {
    if (statusPending.current) return;
    statusPending.current = true;
    setUpdatingSession(sessionId);
    try {
      await api.post(`/api/exam-cell/sessions/${sessionId}/status`, { status });
      toast.success(`Session marked ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      statusPending.current = false;
      setUpdatingSession(null);
    }
  }

  const columns: DataTableColumn<ExamSession>[] = [
    { key: 'name', header: 'Session', render: (r) => <div><p className="font-medium">{r.session_name}</p><p className="text-xs text-muted-foreground">{r.academic_year}</p></div> },
    {
      key: 'cycle',
      header: 'Cycle',
      render: (r) => {
        const cycleType = String(r.cycle_type ?? '').trim();
        return (
          <Badge variant="outline">
            {cycleType ? cycleType.replace(/_/g, ' ') : '—'}
          </Badge>
        );
      },
    },
    { key: 'sem', header: 'Semester', render: (r) => r.semester ?? '—' },
    { key: 'program', header: 'Program', render: (r) => r.program_label ?? '—' },
    { key: 'dates', header: 'Dates', render: (r) => `${formatSessionDate(r.start_date)} → ${formatSessionDate(r.end_date)}` },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canManage ? (
        <div className="flex flex-wrap gap-1">
          {r.status === 'DRAFT' ? <Button size="sm" variant="outline" disabled={updatingSession !== null} onClick={() => void setStatus(r.session_id, 'OPEN')}>{updatingSession === r.session_id ? 'Updating…' : 'Open'}</Button> : null}
          {r.status === 'OPEN' ? <Button size="sm" variant="outline" disabled={updatingSession !== null} onClick={() => void setStatus(r.session_id, 'ACTIVE')}>{updatingSession === r.session_id ? 'Updating…' : 'Activate'}</Button> : null}
          {r.status === 'ACTIVE' ? <Button size="sm" variant="outline" disabled={updatingSession !== null} onClick={() => void setStatus(r.session_id, 'CLOSED')}>{updatingSession === r.session_id ? 'Updating…' : 'Close'}</Button> : null}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="sessions" />
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Create examination session</CardTitle></CardHeader>
          <CardContent>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void createSession(); }}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <label htmlFor="exam-session-name" className="text-sm font-medium text-sgvu-navy">Session name</label>
                <Input id="exam-session-name" required placeholder="e.g. End Semester Examination" value={form.session_name} onChange={(e) => setForm((f) => ({ ...f, session_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label htmlFor="exam-session-year" className="text-sm font-medium text-sgvu-navy">Academic year</label>
                <Input id="exam-session-year" value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label htmlFor="exam-session-cycle" className="text-sm font-medium text-sgvu-navy">Examination cycle</label>
              <Select id="exam-session-cycle" value={form.cycle_type} onChange={(e) => setForm((f) => ({ ...f, cycle_type: e.target.value }))}>
                {CYCLE_TYPES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="exam-session-semester" className="text-sm font-medium text-sgvu-navy">Semester</label>
                <Input id="exam-session-semester" type="number" value={form.semester} onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label htmlFor="exam-session-program" className="text-sm font-medium text-sgvu-navy">Program</label>
                <Input id="exam-session-program" value={form.program_label} onChange={(e) => setForm((f) => ({ ...f, program_label: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label htmlFor="exam-session-start" className="text-sm font-medium text-sgvu-navy">Start date</label>
                <Input id="exam-session-start" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label htmlFor="exam-session-end" className="text-sm font-medium text-sgvu-navy">End date</label>
                <Input id="exam-session-end" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={creating}>{creating ? 'Creating session…' : 'Create session'}</Button>
            </div>
          </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Examination sessions</CardTitle></CardHeader>
        <CardContent>
          {error ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>Retry</Button></div> : null}
          {loading ? <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading examination sessions…</div> : !error || rows.length > 0 ? (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.session_id} emptyMessage="No examination sessions configured." />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
