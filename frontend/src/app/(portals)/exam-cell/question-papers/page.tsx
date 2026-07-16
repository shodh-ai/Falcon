'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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

type QuestionPaper = {
  qp_id: string;
  subject_name: string | null;
  subject_code: string | null;
  exam_date: string | null;
  exam_type: string | null;
  setter_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type Subject = { subject_id: number; subject_code: string; subject_name: string; semester: number };
type Schedule = { exam_schedule_id: string; subject_name?: string; subject_code?: string; exam_date: string; exam_type: string };

const STATUS_FLOW = ['UPLOADED', 'UNDER_MODERATION', 'COE_APPROVED', 'PRINT_AUTHORIZED'];

export default function ExamCellQuestionPapersPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.roles ?? user?.role, 'manage_qp');
  const [rows, setRows] = useState<QuestionPaper[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subject_id: '', exam_schedule_id: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [papers, subjectRows, scheduleRows] = await Promise.all([
        api.get<QuestionPaper[]>('/api/exam-cell/question-papers'),
        api.get<Subject[]>('/api/exam-cell/subjects'),
        api.get<Schedule[]>('/api/exam-cell/schedules'),
      ]);
      setRows(papers);
      setSubjects(subjectRows);
      setSchedules(scheduleRows);
      setForm((f) => (f.subject_id || !subjectRows[0] ? f : { ...f, subject_id: String(subjectRows[0].subject_id) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load question papers');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function createRecord() {
    if (!form.subject_id && !form.exam_schedule_id) {
      toast.error('Select at least a subject or exam schedule');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/exam-cell/question-papers', {
        subject_id: form.subject_id ? Number(form.subject_id) : undefined,
        exam_schedule_id: form.exam_schedule_id || undefined,
        notes: form.notes.trim() || 'QP record created by COE desk',
      });
      toast.success('Question paper record created');
      setForm((f) => ({ ...f, notes: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create question paper record');
    } finally {
      setBusy(false);
    }
  }

  async function advanceStatus(qpId: string, current: string) {
    const idx = STATUS_FLOW.indexOf(current);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    try {
      await api.post(`/api/exam-cell/question-papers/${qpId}/status`, { status: next });
      toast.success(`Status updated to ${next.replace(/_/g, ' ')}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  const columns: DataTableColumn<QuestionPaper>[] = [
    { key: 'subject', header: 'Subject', render: (r) => (
      <div><p className="font-medium">{r.subject_name ?? '—'}</p><p className="text-xs text-muted-foreground">{r.subject_code ?? ''}</p></div>
    ) },
    { key: 'exam', header: 'Exam', render: (r) => `${r.exam_type ?? '—'} · ${r.exam_date ?? '—'}` },
    { key: 'setter', header: 'Setter', render: (r) => r.setter_name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={r.status === 'PRINT_AUTHORIZED' ? 'default' : 'outline'}>{r.status.replace(/_/g, ' ')}</Badge> },
    {
      key: 'actions',
      header: 'Workflow',
      render: (r) => canManage && STATUS_FLOW.indexOf(r.status) < STATUS_FLOW.length - 1 ? (
        <Button size="sm" variant="outline" onClick={() => void advanceStatus(r.qp_id, r.status)}>Advance</Button>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="question-papers" />

      {canManage ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Register question paper</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject</label>
              <Select className="w-full rounded-md border px-3 py-2 text-sm" value={form.subject_id} onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}>
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>{s.subject_code} — {s.subject_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Exam schedule (optional)</label>
              <Select className="w-full rounded-md border px-3 py-2 text-sm" value={form.exam_schedule_id} onChange={(e) => setForm((f) => ({ ...f, exam_schedule_id: e.target.value }))}>
                <option value="">None</option>
                {schedules.map((s) => (
                  <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                    {s.subject_code ?? 'Exam'} · {s.exam_date} · {s.exam_type}
                  </option>
                ))}
              </Select>
            </div>
            <Input placeholder="Notes (setter reference, moderation notes…)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="sm:col-span-2" />
            <Button onClick={() => void createRecord()} disabled={busy} className="sm:col-span-2">
              <Plus className="mr-2 h-4 w-4" />Add record
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Question paper control — audit trail enabled</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.qp_id} emptyMessage="No question paper records. Add one above or run db:migrate if the table is missing." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
