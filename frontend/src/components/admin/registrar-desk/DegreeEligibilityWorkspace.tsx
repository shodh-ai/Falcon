'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, History, Loader2, Printer, Search } from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type EligibilityRow = {
  audit_id: string;
  student_user_id: string;
  student_name?: string;
  enrollment_no?: string;
  prn_number?: string;
  program_name?: string;
  department_name?: string;
  batch?: string;
  credits_required: number;
  credits_earned: number;
  cgpa_required: number;
  cgpa_earned?: number | null;
  pending_backlogs: number;
  library_clearance: boolean;
  finance_clearance: boolean;
  hostel_clearance: boolean;
  examination_clearance: boolean;
  final_status: string;
  registrar_decision?: string;
  registrar_remarks?: string;
  registrar_decided_at?: string;
  registrar_decided_by_name?: string;
  checked_at?: string;
};

type HistoryRow = {
  history_id: string;
  decision: string;
  remarks?: string;
  decided_by_name?: string;
  created_at: string;
};

const PAGE = 10;

function clearanceLabel(ok: boolean) {
  return ok ? 'Y' : '—';
}

function ClearanceHeader() {
  return (
    <div className="space-y-2 text-center">
      <span>Clearances</span>
      <div className="mx-auto grid w-24 grid-cols-4 text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">
        {['Lib', 'Fin', 'Hos', 'Exm'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function ClearanceValues({ row }: { row: EligibilityRow }) {
  const values = [
    row.library_clearance,
    row.finance_clearance,
    row.hostel_clearance,
    row.examination_clearance,
  ];
  return (
    <div className="mx-auto grid w-24 grid-cols-4 text-xs tabular-nums">
      {values.map((ok, index) => (
        <span
          key={index}
          className={cn('text-center', ok ? 'font-semibold text-emerald-600' : 'text-muted-foreground')}
        >
          {clearanceLabel(ok)}
        </span>
      ))}
    </div>
  );
}

function shortStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function statusClass(status: string) {
  if (status === 'ELIGIBLE') return 'bg-emerald-50 text-emerald-700';
  if (status === 'NOT_ELIGIBLE') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
}

function decisionClass(status?: string) {
  const s = (status ?? 'PENDING').toUpperCase();
  if (s === 'APPROVED') return 'bg-emerald-50 text-emerald-700';
  if (s === 'REJECTED') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
}

export function DegreeEligibilityWorkspace() {
  const api = useAuthedApi();
  const printRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<EligibilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [decideTarget, setDecideTarget] = useState<EligibilityRow | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const data = await api.get<EligibilityRow[]>(`${REGISTRAR_DESK.degreeEligibility}?${params}`);
      setRows(Array.isArray(data) ? data : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load degree eligibility', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageRows = useMemo(() => rows.slice(offset, offset + PAGE), [rows, offset]);

  function exportCsv() {
    const header = [
      'Student',
      'Enrollment',
      'Program',
      'Credits earned',
      'Credits required',
      'CGPA earned',
      'CGPA required',
      'Backlogs',
      'Library',
      'Finance',
      'Hostel',
      'Exam',
      'Final status',
      'Registrar decision',
      'Checked at',
    ];
    const body = rows.map((r) =>
      [
        r.student_name ?? '',
        r.enrollment_no ?? r.prn_number ?? '',
        r.program_name ?? '',
        r.credits_earned,
        r.credits_required,
        r.cgpa_earned ?? '',
        r.cgpa_required,
        r.pending_backlogs,
        r.library_clearance ? 'Yes' : 'No',
        r.finance_clearance ? 'Yes' : 'No',
        r.hostel_clearance ? 'Yes' : 'No',
        r.examination_clearance ? 'Yes' : 'No',
        r.final_status,
        r.registrar_decision ?? 'PENDING',
        r.checked_at ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'degree-eligibility.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handlePrint() {
    const node = printRef.current;
    if (!node) return;
    const w = window.open('', '_blank');
    if (!w) {
      toast.warning('Allow pop-ups to print');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Degree Eligibility</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#0B2447;font-size:12px}
        h1{font-size:18px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
        th{background:#0B2447;color:#fff}
      </style></head><body>
      <h1>Degree Eligibility Audit</h1>
      ${node.innerHTML}
      <script>window.print();window.close();</script></body></html>`);
    w.document.close();
  }

  function openDecide(row: EligibilityRow, next: 'APPROVED' | 'REJECTED') {
    setDecideTarget(row);
    setDecision(next);
    setRemarks(row.registrar_remarks ?? '');
  }

  async function submitDecision() {
    if (!decideTarget) return;
    if (decision === 'APPROVED' && !remarks.trim()) {
      toast.warning('Add approval remarks', {
        description: 'Registrar degree approval requires an audit remark.',
      });
      return;
    }
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.degreeEligibilityDecide(decideTarget.audit_id), {
        decision,
        remarks: remarks.trim() || undefined,
      });
      toast.success(decision === 'APPROVED' ? 'Degree approved' : 'Degree approval rejected');
      setDecideTarget(null);
      await load();
    } catch (e) {
      toast.error('Decision failed', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(row: EligibilityRow) {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const data = await api.get<HistoryRow[]>(
        REGISTRAR_DESK.degreeEligibilityHistory(row.audit_id),
      );
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistoryRows([]);
      toast.error('Could not load approval history', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <RegistrarDeskChrome
      title="Degree Eligibility"
      subtitle="Exam Cell eligibility audit with Registrar approve/reject before degree certificate issuance."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Student name or enrollment…"
              />
            </div>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className={cn('h-10 flex-1 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)}
              onClick={exportCsv}
            >
              Export CSV
            </button>
            <button
              type="button"
              className={cn('inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', REG_OUTLINE_BTN)}
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Eligibility & Registrar approval</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No degree eligibility audits found.
            </div>
          ) : (
            <>
              <div ref={printRef} className="[&>div]:overflow-visible">
                <Table className="w-full table-fixed [&_td]:px-4 [&_td]:py-4 [&_th]:px-4 [&_th]:py-3 [&_th]:align-middle">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[16%]" />
                    <col className="w-[18%]" />
                    <col className="w-[20%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Student</TableHead>
                      <TableHead className="text-xs">Academics</TableHead>
                      <TableHead className="text-xs">
                        <ClearanceHeader />
                      </TableHead>
                      <TableHead className="text-center text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      const canApprove = r.final_status === 'ELIGIBLE';
                      const decision = (r.registrar_decision ?? 'PENDING').toUpperCase();
                      return (
                        <TableRow key={r.audit_id}>
                          <TableCell className="align-middle">
                            <p className="truncate font-medium text-sgvu-navy">{r.student_name ?? '—'}</p>
                            <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
                              {r.enrollment_no ?? r.prn_number ?? '—'}
                              {r.program_name ? ` · ${r.program_name}` : ''}
                            </p>
                          </TableCell>
                          <TableCell className="align-middle">
                            <div className="space-y-0.5 text-xs leading-5 tabular-nums">
                              <p>{r.credits_earned}/{r.credits_required} cr</p>
                              <p className="text-muted-foreground">
                                {r.cgpa_earned != null ? r.cgpa_earned : '—'}/{r.cgpa_required} GPA
                              </p>
                              <p className="text-muted-foreground">
                                {r.pending_backlogs} backlog{r.pending_backlogs === 1 ? '' : 's'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="align-middle">
                            <ClearanceValues row={r} />
                          </TableCell>
                          <TableCell className="align-middle">
                            <div className="mx-auto flex w-fit flex-col items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'whitespace-nowrap border-transparent px-2 py-0.5 text-[10px]',
                                  statusClass(r.final_status),
                                )}
                              >
                                Exam: {shortStatus(r.final_status)}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'whitespace-nowrap border-transparent px-2 py-0.5 text-[10px]',
                                  decisionClass(decision),
                                )}
                              >
                                Reg: {decision}
                              </Badge>
                              {r.registrar_decided_by_name ? (
                                <p className="max-w-[10rem] truncate text-center text-[10px] text-muted-foreground">
                                  {r.registrar_decided_by_name}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-middle text-right">
                            <div className="flex justify-end">
                              <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  className={cn(
                                    'h-8 gap-1.5 px-3 text-xs font-semibold',
                                    REG_BRAND_BTN,
                                  )}
                                >
                                  View
                                  <ChevronDown className="h-3.5 w-3.5 opacity-90" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                                  Degree review
                                </DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => void openHistory(r)}>
                                  <History className="mr-2 h-4 w-4" />
                                  History
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={!canApprove}
                                  onSelect={() => openDecide(r, 'APPROVED')}
                                >
                                  Approve
                                  {!canApprove ? (
                                    <span className="ml-auto text-[10px] text-muted-foreground">
                                      not eligible
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => openDecide(r, 'REJECTED')}>
                                  Reject
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-sgvu-navy/10 p-4">
                <PaginationBar total={rows.length} limit={PAGE} offset={offset} onPageChange={setOffset} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decideTarget} onOpenChange={(o) => !o && setDecideTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'APPROVED' ? 'Approve degree issuance' : 'Reject degree approval'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {decideTarget?.student_name} ·{' '}
            {decideTarget?.enrollment_no ?? decideTarget?.prn_number ?? '—'} · Exam status{' '}
            {decideTarget?.final_status}
          </p>
          <label className="mt-3 block space-y-1">
            <span className="text-xs text-muted-foreground">
              Remarks {decision === 'APPROVED' ? '(required)' : '(optional)'}
            </span>
            <textarea
              className="min-h-[96px] w-full rounded-md border px-3 py-2 text-sm"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Registrar decision remarks for audit trail"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>
              Cancel
            </Button>
            <Button
              className={cn(REG_BRAND_BTN)}
              disabled={saving}
              onClick={() => void submitDecision()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm {decision === 'APPROVED' ? 'approval' : 'rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar approval history</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : historyRows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No approval history yet.</p>
          ) : (
            <div className="max-h-80 space-y-3 overflow-y-auto">
              {historyRows.map((h) => (
                <div key={h.history_id} className="rounded-lg border border-sgvu-navy/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn('border-transparent', decisionClass(h.decision))}
                    >
                      {h.decision}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {h.decided_by_name ?? 'Registrar'}
                  </p>
                  {h.remarks ? <p className="mt-2 text-sm text-sgvu-navy">{h.remarks}</p> : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
