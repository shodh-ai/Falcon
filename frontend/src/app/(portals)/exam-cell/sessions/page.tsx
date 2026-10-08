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
  const canManage = canExamCellAction(user?.roles ?? user?.role, 'manage_sessions');
  const [rows, setRows] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      setRows(await api.get<ExamSession[]>('/api/exam-cell/sessions'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function createSession() {
    if (!form.session_name.trim()) {
      toast.error('Session name is required');
      return;
    }
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
    }
  }

  async function setStatus(sessionId: string, status: string) {
    try {
      await api.post(`/api/exam-cell/sessions/${sessionId}/status`, { status });
      toast.success(`Session marked ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  const columns: DataTableColumn<ExamSession>[] = [
    { key: 'name', header: 'Session', render: (r) => <div><p className="font-medium">{r.session_name}</p><p className="text-xs text-muted-foreground">{r.academic_year}</p></div> },
    { key: 'cycle', header: 'Cycle', render: (r) => <Badge variant="outline">{r.cycle_type.replace(/_/g, ' ')}</Badge> },
    { key: 'sem', header: 'Semester', render: (r) => r.semester ?? '—' },
    { key: 'program', header: 'Program', render: (r) => r.program_label ?? '—' },
    { key: 'dates', header: 'Dates', render: (r) => `${r.start_date ?? '—'} → ${r.end_date ?? '—'}` },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canManage ? (
        <div className="flex flex-wrap gap-1">
          {r.status === 'DRAFT' ? <Button size="sm" variant="outline" onClick={() => void setStatus(r.session_id, 'OPEN')}>Open</Button> : null}
          {r.status === 'OPEN' ? <Button size="sm" variant="outline" onClick={() => void setStatus(r.session_id, 'ACTIVE')}>Activate</Button> : null}
          {r.status === 'ACTIVE' ? <Button size="sm" variant="outline" onClick={() => void setStatus(r.session_id, 'CLOSED')}>Close</Button> : null}
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
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input placeholder="Session name" value={form.session_name} onChange={(e) => setForm((f) => ({ ...f, session_name: e.target.value }))} className="sm:col-span-2 lg:col-span-3" />
              <Input placeholder="Academic year" value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} />
              <Select className="rounded-md border px-3 py-2 text-sm" value={form.cycle_type} onChange={(e) => setForm((f) => ({ ...f, cycle_type: e.target.value }))}>
                {CYCLE_TYPES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </Select>
              <Input type="number" placeholder="Semester" value={form.semester} onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))} />
              <Input placeholder="Program" value={form.program_label} onChange={(e) => setForm((f) => ({ ...f, program_label: e.target.value }))} />
              <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
            <div className="flex justify-center">
              <Button onClick={() => void createSession()}>Create session</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Examination sessions</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.session_id} emptyMessage="No examination sessions configured." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
