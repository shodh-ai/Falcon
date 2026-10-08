'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type BacklogApp = {
  exam_application_id: string;
  student_name: string;
  enrollment_number: string | null;
  subject_name: string;
  subject_code: string;
  fee_status: string;
  status: string;
  created_at: string;
};

export default function ExamCellBacklogExamsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<BacklogApp[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      setRows(await api.get<BacklogApp[]>(`/api/exam-cell/backlog-applications${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load backlog applications');
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<BacklogApp>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'subject', header: 'Subject', render: (r) => (
      <div><p className="font-medium">{r.subject_code}</p><p className="text-xs text-muted-foreground">{r.subject_name}</p></div>
    ) },
    { key: 'fee', header: 'Fee', render: (r) => <Badge variant={r.fee_status === 'PAID' ? 'default' : 'secondary'}>{r.fee_status}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <Badge variant="outline">{r.status}</Badge> },
    { key: 'date', header: 'Applied', render: (r) => new Date(r.created_at).toLocaleDateString('en-IN') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="backlog-exams" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Backlog & supplementary applications</CardTitle>
          <Select className="rounded-md border px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.exam_application_id} emptyMessage="No backlog or supplementary applications." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
