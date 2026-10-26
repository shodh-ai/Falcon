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

export default function ExamCellSessionsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.primaryRole ?? user?.role, 'manage_sessions');
  const [snapshot, setSnapshot] = useState<{
    api: typeof api; rows: ExamSession[]; error: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRequest = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mutationInFlight = useRef(false);
  const [form, setForm] = useState({
    academic_year: '',
    session_name: '',
    cycle_type: 'END_SEMESTER',
    semester: '',
    program_label: '',
    start_date: '',
    end_date: '',
  });

  const load = useCallback(() => {
    const requestId = ++loadRequest.current;
    return api.get<ExamSession[]>('/api/exam-cell/sessions').then(
      (rows) => {
        if (requestId === loadRequest.current) setSnapshot({ api, rows, error: null });
      },
      (e: unknown) => {
        if (requestId === loadRequest.current) setSnapshot({
          api, rows: [], error: e instanceof Error ? e.message : 'Failed to load sessions',
        });
      },
    ).finally(() => {
      if (requestId === loadRequest.current) setRefreshing(false);
    });
  }, [api]);

  useEffect(() => {
    void load();
    return () => { loadRequest.current += 1; };
  }, [load]);

  const loading = refreshing || snapshot?.api !== api;
  const rows = snapshot?.api === api ? snapshot.rows : [];
  const loadError = !loading && snapshot?.api === api ? snapshot.error : null;

  async function refresh() {
    setRefreshing(true);
    await load();
  }

  async function createSession() {
    if (!canManage || mutationInFlight.current) return;
    setSaveError(null);
    if (!form.session_name.trim() || !form.academic_year.trim()) {
      setSaveError('Session name and academic year are required');
      return;
    }
    if (form.semester && (!Number.isInteger(Number(form.semester)) || Number(form.semester) < 1)) {
      setSaveError('Semester must be a positive whole number');
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setSaveError('End date must not be before start date');
      return;
    }
    mutationInFlight.current = true;
    setSaving(true);
    try {
      await api.post('/api/exam-cell/sessions', {
        ...form,
        session_name: form.session_name.trim(),
        academic_year: form.academic_year.trim(),
        program_label: form.program_label.trim() || undefined,
        semester: form.semester ? Number(form.semester) : undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      });
      toast.success('Exam session created');
      setForm((f) => ({ ...f, session_name: '' }));
      await refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }

  async function setStatus(sessionId: string, status: string) {
    if (!canManage || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/api/exam-cell/sessions/${sessionId}/status`, { status });
      toast.success(`Session marked ${status}`);
      await refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
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
    { key: 'dates', header: 'Dates', render: (r) => `${r.start_date ?? '—'} → ${r.end_date ?? '—'}` },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canManage ? (
        <div className="flex flex-wrap gap-1">
          {r.status === 'DRAFT' ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void setStatus(r.session_id, 'OPEN')}>Open</Button> : null}
          {r.status === 'OPEN' ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void setStatus(r.session_id, 'ACTIVE')}>Activate</Button> : null}
          {r.status === 'ACTIVE' ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void setStatus(r.session_id, 'CLOSED')}>Close</Button> : null}
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

      {saveError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p> : null}

      {canManage ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Create examination session</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input aria-label="Session name" maxLength={120} placeholder="Session name" value={form.session_name} onChange={(e) => setForm((f) => ({ ...f, session_name: e.target.value }))} className="sm:col-span-2 lg:col-span-3" />
              <Input aria-label="Academic year" maxLength={12} placeholder="Academic year" value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} />
              <label className="sr-only" htmlFor="exam-session-cycle">Examination cycle</label>
              <Select id="exam-session-cycle" className="rounded-md border px-3 py-2 text-sm" value={form.cycle_type} onChange={(e) => setForm((f) => ({ ...f, cycle_type: e.target.value }))}>
                {CYCLE_TYPES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </Select>
              <Input aria-label="Semester" type="number" min={1} step={1} placeholder="Semester (optional)" value={form.semester} onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))} />
              <Input aria-label="Program label" maxLength={80} placeholder="Program label (optional)" value={form.program_label} onChange={(e) => setForm((f) => ({ ...f, program_label: e.target.value }))} />
              <Input aria-label="Start date" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              <Input aria-label="End date" type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
            <div className="flex justify-center">
              <Button disabled={saving} onClick={() => void createSession()}>{saving ? 'Saving…' : 'Create session'}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Examination sessions</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 aria-label="Loading sessions" className="h-6 w-6 animate-spin" /> : loadError ? (
            <div role="alert" className="space-y-2 text-sm text-red-700">
              <p>{loadError}</p>
              <Button variant="outline" onClick={() => void refresh()}>Retry loading sessions</Button>
            </div>
          ) : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.session_id} emptyMessage="No examination sessions configured." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
