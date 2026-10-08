'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const [stageFilter, setStageFilter] = useState('ALL');
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const batchLabel = buildExamBatchLabel(semester, examType);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ semester, batch_label: batchLabel });
      if (stageFilter && stageFilter !== 'ALL') qs.set('stage', stageFilter);
      const res = await api.get<{ data: Approval[] } | Approval[]>(
        `/api/exam-cell/hall-ticket-approvals?${qs}`,
      );
      setRows(Array.isArray(res) ? res : (res?.data ?? []));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load approvals');
      setRows([]);
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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="border-[#0B2447] bg-[#0B2447] text-white hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
            onClick={() => void advance(r.approval_id, 'APPROVE')}
          >
            Advance
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="border-red-600/30 text-red-700 hover:bg-red-50 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
            onClick={() => void advance(r.approval_id, 'REJECT')}
          >
            Reject
          </Button>
        </div>
      ) : null,
    },
  ];

  const filterSelectClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const actionBtnClass =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  const workflowSteps = [
    'Registration',
    'Eligibility',
    'Finance',
    'Exam Office',
    'COE',
    'Hall Ticket',
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="hall-ticket-approvals" actions={
            <Button asChild variant="outline" size="sm" className={actionBtnClass}>
              <Link href="/exam-cell/admit-cards">Generate hall tickets</Link>
            </Button>
          } />
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-sgvu-navy/50">Approval workflow</p>
          <div className="flex flex-wrap items-center gap-2">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-sgvu-navy/15 bg-sgvu-navy/[0.04] px-3 py-1.5 text-xs font-semibold text-sgvu-navy">
                  <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0B2447] text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </span>
                {index < workflowSteps.length - 1 ? (
                  <span className="hidden text-sgvu-navy/30 sm:inline" aria-hidden>
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Approval queue</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading ? 'Loading records…' : `${rows.length} record${rows.length === 1 ? '' : 's'} · ${batchLabel}`}
              </p>
            </div>
            {canApprove ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} className={actionBtnClass} onClick={() => void syncQueue()}>
                  {busy ? 'Working…' : 'Sync from eligibility'}
                </Button>
                <Button size="sm" disabled={busy} className={actionBtnClass} onClick={() => void bulkApprove()}>
                  Bulk advance to COE
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Semester</label>
              <Select className={filterSelectClass} value={semester} onChange={(e) => setSemester(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Exam type</label>
              <Select className={filterSelectClass} value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
                <option value="MID_TERM">Mid Term</option>
                <option value="END_TERM">End Term</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Stage</label>
              <Select className={filterSelectClass} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="ALL">All stages</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.approval_id}
              emptyMessage="No approval records yet. Use Sync from eligibility to build the queue."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
