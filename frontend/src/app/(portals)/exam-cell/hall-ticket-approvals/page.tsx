'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';
import { buildExamBatchLabel, type ExamType } from '@/lib/exam-cell-batch';

type Approval = {
  approval_id: string;
  student_name: string;
  enrollment_number: string | null;
  stage: string;
  eligibility_status: string;
  finance_status: string;
  exam_office_status: string;
  coe_status: string;
  block_reasons: string[];
};

const STAGES = ['REGISTRATION', 'ELIGIBILITY', 'FINANCE', 'EXAM_OFFICE', 'COE', 'APPROVED', 'REJECTED'];

export default function ExamCellHallTicketApprovalsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canApprove = canExamCellAction(user?.roles ?? user?.role, 'generate_admit_cards');
  const [semester, setSemester] = useState('4');
  const [examType, setExamType] = useState<ExamType>('END_TERM');
  const [stageFilter, setStageFilter] = useState('');
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const batchLabel = buildExamBatchLabel(semester, examType);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ semester, batch_label: batchLabel });
      if (stageFilter) qs.set('stage', stageFilter);
      setRows(await api.get<Approval[]>(`/api/exam-cell/hall-ticket-approvals?${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [api, semester, examType, batchLabel, stageFilter]);

  useEffect(() => { void load(); }, [load]);

  async function syncQueue() {
    setBusy(true);
    try {
      const res = await api.post<{ synced: number; total?: number }>('/api/exam-cell/hall-ticket-approvals/sync', {
        semester: Number(semester),
        batch_label: batchLabel,
      });
      toast.success(`Synced ${res.synced}${res.total != null ? ` of ${res.total}` : ''} students into approval queue`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function advance(id: string, action: 'APPROVE' | 'REJECT') {
    setBusy(true);
    try {
      await api.post(`/api/exam-cell/hall-ticket-approvals/${id}/advance`, { action });
      toast.success(action === 'APPROVE' ? 'Advanced to next stage' : 'Rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    setBusy(true);
    try {
      const res = await api.post<{ approved: number }>('/api/exam-cell/hall-ticket-approvals/bulk-approve', {
        semester: Number(semester),
        batch_label: batchLabel,
        target_stage: 'COE',
      });
      toast.success(`Bulk advanced ${res.approved} records to COE review`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk approve failed');
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<Approval>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div><p className="font-medium">{r.student_name}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'stage', header: 'Current stage', render: (r) => <Badge>{r.stage.replace(/_/g, ' ')}</Badge> },
    { key: 'elig', header: 'Eligibility', render: (r) => r.eligibility_status },
    { key: 'finance', header: 'Finance', render: (r) => r.finance_status },
    { key: 'coe', header: 'COE', render: (r) => r.coe_status },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => canApprove && !['APPROVED', 'REJECTED'].includes(r.stage) ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void advance(r.approval_id, 'APPROVE')}>Advance</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void advance(r.approval_id, 'REJECT')}>Reject</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="hall-ticket-approvals" actions={
        <Button asChild variant="outline" size="sm"><Link href="/exam-cell/admit-cards">Generate hall tickets →</Link></Button>
      } />

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="py-4 text-sm">
          <strong>Workflow:</strong> Registration → Eligibility → Finance → Exam Office → COE → Generate Hall Ticket
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Approval queue</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select className="rounded-md border px-2 py-1 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Sem {s}</option>)}
            </Select>
            <Select className="rounded-md border px-2 py-1 text-sm" value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
              <option value="MID_TERM">Mid Term</option>
              <option value="END_TERM">End Term</option>
            </Select>
            <Select className="rounded-md border px-2 py-1 text-sm" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
            {canApprove ? (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void syncQueue()}><RefreshCw className="mr-2 h-4 w-4" />Sync from eligibility</Button>
                <Button size="sm" disabled={busy} onClick={() => void bulkApprove()}>Bulk advance to COE</Button>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.approval_id} emptyMessage="No approval records. Sync from eligibility dashboard first." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
