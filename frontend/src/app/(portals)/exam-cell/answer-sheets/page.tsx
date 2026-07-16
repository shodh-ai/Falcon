'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, QrCode } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type AnswerSheet = {
  sheet_id: string;
  sheet_number: string;
  status: string;
  qr_payload: string;
  student_name: string | null;
  subject_name: string | null;
  exam_date: string | null;
};

const STATUS_FLOW = ['ISSUED', 'COLLECTED', 'PACKED', 'DISPATCHED', 'EVALUATOR_ASSIGNED', 'CHECKED', 'RETURNED', 'ARCHIVED'];

export default function ExamCellAnswerSheetsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AnswerSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetNumber, setSheetNumber] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      setRows(await api.get<AnswerSheet[]>(`/api/exam-cell/answer-sheets${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load answer sheets');
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function issueSheet() {
    if (!sheetNumber.trim()) {
      toast.error('Sheet number required');
      return;
    }
    try {
      const row = await api.post<AnswerSheet>('/api/exam-cell/answer-sheets', { sheet_number: sheetNumber.trim() });
      toast.success(`Issued sheet ${sheetNumber} · QR: ${row.qr_payload.slice(0, 20)}…`);
      setSheetNumber('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Issue failed');
    }
  }

  async function advanceStatus(sheetId: string, current: string) {
    const idx = STATUS_FLOW.indexOf(current);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    try {
      await api.post(`/api/exam-cell/answer-sheets/${sheetId}/status`, { status: next });
      toast.success(`Status → ${next.replace(/_/g, ' ')}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  const columns: DataTableColumn<AnswerSheet>[] = [
    { key: 'number', header: 'Sheet #', render: (r) => <span className="font-mono font-medium">{r.sheet_number}</span> },
    { key: 'qr', header: 'QR', render: (r) => (
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><QrCode className="h-3 w-3" />{r.qr_payload.slice(0, 16)}…</div>
    ) },
    { key: 'student', header: 'Student', render: (r) => r.student_name ?? '—' },
    { key: 'exam', header: 'Exam', render: (r) => `${r.subject_name ?? '—'} · ${r.exam_date ?? '—'}` },
    { key: 'status', header: 'Status', render: (r) => <Badge variant="outline">{r.status.replace(/_/g, ' ')}</Badge> },
    {
      key: 'actions',
      header: 'Lifecycle',
      render: (r) => STATUS_FLOW.indexOf(r.status) < STATUS_FLOW.length - 1 ? (
        <Button size="sm" variant="outline" onClick={() => void advanceStatus(r.sheet_id, r.status)}>Next stage</Button>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="answer-sheets" />

      <Card>
        <CardHeader><CardTitle className="text-base">Issue answer booklet</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Answer sheet number" value={sheetNumber} onChange={(e) => setSheetNumber(e.target.value)} className="max-w-xs" />
          <Button onClick={() => void issueSheet()}><Plus className="mr-2 h-4 w-4" />Issue & generate QR</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Answer sheet tracking</CardTitle>
          <Select className="rounded-md border px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_FLOW.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.sheet_id} emptyMessage="No answer sheets tracked yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
