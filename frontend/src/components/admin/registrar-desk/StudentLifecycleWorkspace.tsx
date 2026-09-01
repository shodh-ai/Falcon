'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, History, Loader2, Search } from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
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
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

const STATUSES = [
  'APPLICANT',
  'ADMITTED',
  'ENROLLED',
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'WITHDRAWN',
  'GRADUATED',
  'ALUMNI',
] as const;

const STATUS_ACTIONS = [
  { next: 'SUSPENDED', label: 'Suspend' },
  { next: 'ACTIVE', label: 'Re-activate' },
  { next: 'WITHDRAWN', label: 'Withdraw' },
  { next: 'GRADUATED', label: 'Mark graduated' },
  { next: 'ALUMNI', label: 'Move to alumni' },
] as const;

type Row = {
  user_id: string;
  name: string;
  official_email?: string;
  enrollment_no?: string;
  department_name?: string;
  program_name?: string;
  lifecycle_status?: string;
};

const PAGE = 10;

export function StudentLifecycleWorkspace() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [dialog, setDialog] = useState<{ row: Row; next: string } | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q.trim()) params.set('q', q.trim());
      if (status !== 'all') params.set('status', status);
      const data = await api.get<{ rows: Row[]; total: number }>(
        `${REGISTRAR_DESK.placementStudents}?${params}`,
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error('Could not load lifecycle roster', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [api, offset, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openHistory(row: Row) {
    setHistoryFor(row);
    try {
      const h = await api.get<Array<Record<string, unknown>>>(
        REGISTRAR_DESK.lifecycleHistory(row.user_id),
      );
      setHistory(Array.isArray(h) ? h : []);
    } catch {
      setHistory([]);
    }
  }

  async function applyStatus() {
    if (!dialog) return;
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.lifecycle(dialog.row.user_id), {
        status: dialog.next,
        remarks: reason.trim() || undefined,
      });
      toast.success(`Status updated to ${dialog.next.replace(/_/g, ' ')}`);
      setDialog(null);
      setReason('');
      void load();
    } catch (e) {
      toast.error('Status change failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ['Name', 'Email', 'Enrollment', 'Department', 'Program', 'Status'];
    const body = rows.map((r) =>
      [
        r.name,
        r.official_email ?? '',
        r.enrollment_no ?? '',
        r.department_name ?? '',
        r.program_name ?? '',
        r.lifecycle_status ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'student-lifecycle.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RegistrarDeskChrome
      title="Student Lifecycle"
      subtitle="Manage Applicant → Alumni status transitions with full audit history."
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <label className="md:col-span-2 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                placeholder="Name, email, enrollment…"
              />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select
              value={status}
              onValueChange={(v) => {
                setOffset(0);
                setStatus(v);
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_BRAND_BTN)}
              onClick={exportCsv}
            >
              Export
            </button>
            <button
              type="button"
              className={cn('h-10 rounded-lg px-4 text-sm font-semibold', REG_OUTLINE_BTN)}
              onClick={() => window.print()}
            >
              Print
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">Lifecycle roster</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No students found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Enrollment</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const current = String(r.lifecycle_status ?? 'ACTIVE').toUpperCase();
                      return (
                        <TableRow key={r.user_id}>
                          <TableCell>
                            <p className="font-medium text-sgvu-navy">{r.name}</p>
                            <p className="text-xs text-muted-foreground">{r.official_email}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.enrollment_no ?? '—'}</TableCell>
                          <TableCell>{r.program_name ?? '—'}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="border-transparent bg-sgvu-navy/5 text-sgvu-navy"
                            >
                              {current.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
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
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                                  Change status
                                </DropdownMenuLabel>
                                {STATUS_ACTIONS.map((action) => (
                                  <DropdownMenuItem
                                    key={action.next}
                                    disabled={current === action.next}
                                    onSelect={() => {
                                      setDialog({ row: r, next: action.next });
                                      setReason('');
                                    }}
                                  >
                                    {action.label}
                                    {current === action.next ? (
                                      <span className="ml-auto text-[10px] text-muted-foreground">
                                        current
                                      </span>
                                    ) : null}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => void openHistory(r)}>
                                  <History className="mr-2 h-4 w-4" />
                                  View history
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-sgvu-navy/10 p-4">
                <PaginationBar total={total} limit={PAGE} offset={offset} onPageChange={setOffset} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {historyFor ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="border-b border-sgvu-navy/10 pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-bold text-sgvu-navy">
                Status history — {historyFor.name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setHistoryFor(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No status changes recorded.</p>
            ) : (
              history.map((h) => (
                <div
                  key={String(h.history_id)}
                  className="rounded-lg border border-sgvu-navy/10 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-sgvu-navy">
                    {String(h.from_status ?? '—')} → {String(h.to_status ?? '—')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.changed_by_name ? String(h.changed_by_name) : 'System'}
                    {h.remarks ? ` · ${String(h.remarks)}` : ''}
                    {h.created_at ? ` · ${new Date(String(h.created_at)).toLocaleString()}` : ''}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status to {dialog?.next.replace(/_/g, ' ')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dialog?.row.name} — confirm this lifecycle transition. An audit entry will be created.
          </p>
          <Textarea
            placeholder="Reason / remarks (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void applyStatus()}>
              {saving ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
