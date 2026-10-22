'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

type AnswerSheet = {
  sheet_id: string;
  sheet_number: string;
  status: string;
  qr_payload: string;
  student_name: string | null;
  subject_name: string | null;
  exam_date: string | null;
};

const STATUS_FLOW = [
  'ISSUED',
  'COLLECTED',
  'PACKED',
  'DISPATCHED',
  'EVALUATOR_ASSIGNED',
  'CHECKED',
  'RETURNED',
  'ARCHIVED',
] as const;

const fieldClass =
  'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
const btnPrimary =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

function statusTone(status: string) {
  const key = status.toUpperCase();
  if (key === 'ISSUED' || key === 'COLLECTED') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (key === 'PACKED' || key === 'DISPATCHED') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (key === 'EVALUATOR_ASSIGNED' || key === 'CHECKED') return 'border-violet-200 bg-violet-50 text-violet-800';
  if (key === 'RETURNED' || key === 'ARCHIVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-sgvu-navy/15 bg-sgvu-navy/[0.04] text-sgvu-navy';
}

export default function ExamCellAnswerSheetsPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'manage_sessions');
  const [activeAction, setActiveAction] = useState<'issue' | 'advance' | null>(null);
  const busy = activeAction !== null;
  const mutationPending = useRef(false);
  const [sheetNumber, setSheetNumber] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [revision, setRevision] = useState(0);
  const requestKey = `${statusFilter}:${revision}`;
  const [resource, setResource] = useState<{ api: typeof api | null; key: string; rows: AnswerSheet[]; error: string | null }>({ api: null, key: '', rows: [], error: null });
  const loading = resource.api !== api || resource.key !== requestKey;
  const rows = loading ? [] : resource.rows;
  const error = loading ? null : resource.error;

  useEffect(() => {
    let cancelled = false;
    const qs = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
    api.get<AnswerSheet[] | { data: AnswerSheet[] }>(`/api/exam-cell/answer-sheets${qs}`).then(
      (data) => { if (!cancelled) setResource({ api, key: requestKey, rows: Array.isArray(data) ? data : (data?.data ?? []), error: null }); },
      (cause) => { if (!cancelled) setResource({ api, key: requestKey, rows: [], error: cause instanceof Error ? cause.message : 'Failed to load answer sheets' }); },
    );
    return () => { cancelled = true; };
  }, [api, statusFilter, requestKey]);

  async function issueSheet() {
    if (!canManage || mutationPending.current) return;
    if (!sheetNumber.trim()) {
      toast.error('Sheet number required');
      return;
    }
    mutationPending.current = true;
    setActiveAction('issue');
    try {
      const row = await api.post<AnswerSheet>('/api/exam-cell/answer-sheets', {
        sheet_number: sheetNumber.trim(),
      });
      toast.success(`Issued sheet ${sheetNumber} · QR: ${row.qr_payload.slice(0, 20)}…`);
      setSheetNumber('');
      setRevision((value) => value + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Issue failed');
    } finally {
      mutationPending.current = false;
      setActiveAction(null);
    }
  }

  async function advanceStatus(sheetId: string, current: string) {
    if (!canManage || mutationPending.current) return;
    const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
    const next = STATUS_FLOW[idx + 1];
    if (idx < 0 || !next) return;
    mutationPending.current = true;
    setActiveAction('advance');
    try {
      await api.post(`/api/exam-cell/answer-sheets/${sheetId}/status`, { status: next });
      toast.success(`Status → ${next.replace(/_/g, ' ')}`);
      setRevision((value) => value + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      mutationPending.current = false;
      setActiveAction(null);
    }
  }

  const columns: DataTableColumn<AnswerSheet>[] = [
    {
      key: 'number',
      header: 'Sheet #',
      render: (r) => (
        <span className="rounded-md bg-sgvu-navy/[0.04] px-2 py-1 font-mono text-sm font-semibold text-sgvu-navy">
          {r.sheet_number}
        </span>
      ),
    },
    {
      key: 'qr',
      header: 'QR',
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.qr_payload.slice(0, 18)}…
        </span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <span className="font-medium text-sgvu-navy">{r.student_name ?? '—'}</span>
      ),
    },
    {
      key: 'exam',
      header: 'Exam',
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-sgvu-navy">{r.subject_name ?? '—'}</p>
          <p className="text-xs text-muted-foreground">
            {r.exam_date ? String(r.exam_date).slice(0, 10) : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant="outline" className={`font-semibold ${statusTone(r.status)}`}>
          {r.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Lifecycle',
      render: (r) => !canManage ? null :
        STATUS_FLOW.indexOf(r.status as (typeof STATUS_FLOW)[number]) >= 0 && STATUS_FLOW.indexOf(r.status as (typeof STATUS_FLOW)[number]) < STATUS_FLOW.length - 1 ? (
          <Button
            size="sm"
            variant="outline"
            className={btnPrimary}
            disabled={busy}
            onClick={() => void advanceStatus(r.sheet_id, r.status)}
          >
            {activeAction === 'advance' ? 'Updating…' : 'Next stage'}
          </Button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">{r.status === 'ARCHIVED' ? 'Complete' : 'Unknown status'}</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="answer-sheets" />
        </CardContent>
      </Card>

      {canManage && <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="border-b border-sgvu-navy/10 pb-4">
            <h2 className="text-lg font-bold text-sgvu-navy">Issue answer booklet</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Enter a sheet number to issue a booklet and generate its QR code.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="answer-sheet-number" className={labelClass}>Sheet number</label>
              <Input
                id="answer-sheet-number"
                disabled={busy}
                className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                placeholder="e.g. AS-2026-001"
                value={sheetNumber}
                onChange={(e) => setSheetNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void issueSheet();
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              className={btnPrimary}
              disabled={busy}
              onClick={() => void issueSheet()}
            >
              {activeAction === 'issue' ? 'Issuing…' : 'Issue & generate QR'}
            </Button>
          </div>
        </CardContent>
      </Card>}

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Answer sheet tracking</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading
                  ? 'Loading sheets…'
                  : `${rows.length} sheet${rows.length === 1 ? '' : 's'}${statusFilter !== 'ALL' ? ' (filtered)' : ''}`}
              </p>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-56">
              <label htmlFor="answer-sheet-status" className={labelClass}>Status</label>
              <Select
                id="answer-sheet-status"
                className={fieldClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                {STATUS_FLOW.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
            </div>
          ) : error ? (
            <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-sgvu-navy">No answer sheets tracked yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Issue a booklet above to start the QR lifecycle, or clear the status filter.
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.sheet_id}
              emptyMessage="No answer sheets match this status."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
