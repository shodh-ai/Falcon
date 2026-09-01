'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Gavel,
  Loader2,
  ScrollText,
  Search,
  Users,
} from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
  RegistrarDeskChrome,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { REGISTRAR_DESK } from '@/lib/api/api.registrar-desk';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
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
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'Academic Council', label: 'Academic Council', icon: Users },
  { id: 'Executive Council', label: 'Executive Council', icon: Gavel },
  { id: 'Policy Approval', label: 'Policy Approvals', icon: ScrollText },
  { id: 'Circular Approval', label: 'Circular Approvals', icon: ScrollText },
  { id: 'Committee Meetings', label: 'Committee Meetings', icon: Users },
  { id: 'Action Tracking', label: 'Action Tracking', icon: ClipboardList },
  { id: 'Approval Workflow', label: 'Approval Workflow', icon: ClipboardList },
] as const;

type GovernanceRow = {
  task_id: string;
  title: string;
  category: string;
  body?: string;
  status: string;
  priority: string;
  due_date?: string;
  owner_name?: string;
  decision_remarks?: string;
  created_at?: string;
  updated_at?: string;
};

const PAGE = 8;

function fmtDate(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return v;
  }
}

function priorityClass(p: string) {
  const u = p.toUpperCase();
  if (u === 'CRITICAL' || u === 'HIGH') return 'bg-red-100 text-red-800';
  if (u === 'LOW') return 'bg-slate-100 text-slate-700';
  return 'bg-amber-100 text-amber-900';
}

function statusClass(s: string) {
  const u = s.toUpperCase();
  if (u === 'APPROVED') return 'bg-emerald-100 text-emerald-800';
  if (u === 'REJECTED') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-900';
}

export function RegistrarGovernanceWorkspace() {
  const api = useAuthedApi();
  const [category, setCategory] = useState<string>(CATEGORIES[0].id);
  const [rows, setRows] = useState<GovernanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<GovernanceRow | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<Partial<GovernanceRow>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category });
      if (statusFilter !== 'all') params.set('status', statusFilter.toUpperCase());
      const data = await api.get<GovernanceRow[]>(`${REGISTRAR_DESK.governance}?${params}`);
      setRows(Array.isArray(data) ? data : []);
      setOffset(0);
    } catch (e) {
      toast.error('Could not load governance tasks', {
        description: e instanceof Error ? e.message : 'Request failed',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, category, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.title, r.body, r.owner_name].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const pageRows = useMemo(() => filtered.slice(offset, offset + PAGE), [filtered, offset]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status.toUpperCase() === 'PENDING').length,
    [rows],
  );

  async function decide(status: 'APPROVED' | 'REJECTED') {
    if (!selected) return;
    setDeciding(true);
    try {
      await api.post(REGISTRAR_DESK.governanceDecide(selected.task_id), {
        status,
        decision_remarks: decisionRemarks.trim() || undefined,
      });
      toast.success(status === 'APPROVED' ? 'Approved' : 'Rejected');
      setSelected(null);
      setDecisionRemarks('');
      void load();
    } catch (e) {
      toast.error('Decision failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setDeciding(false);
    }
  }

  async function saveTask() {
    if (!form.title?.trim()) {
      toast.warning('Title is required');
      return;
    }
    setSaving(true);
    try {
      await api.post(REGISTRAR_DESK.governance, {
        ...form,
        category,
        status: form.status ?? 'PENDING',
        priority: form.priority ?? 'MEDIUM',
      });
      toast.success(form.task_id ? 'Task updated' : 'Task created');
      setCreateOpen(false);
      setForm({});
      void load();
    } catch (e) {
      toast.error('Save failed', { description: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ['Title', 'Category', 'Status', 'Priority', 'Due', 'Owner'];
    const body = filtered.map((r) =>
      [r.title, r.category, r.status, r.priority, fmtDate(r.due_date), r.owner_name ?? '']
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `governance-${category.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Export downloaded');
  }

  return (
    <RegistrarDeskChrome
      title="Governance & Approvals"
      subtitle="Academic Council, Executive Council, policy and circular approvals, committee meetings, and action tracking."
      banner={
        pendingCount > 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {pendingCount} pending {pendingCount === 1 ? 'item requires' : 'items require'} your decision in {category}.
          </p>
        ) : null
      }
    >
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-nowrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold sm:px-3 sm:text-sm',
                  category === c.id ? REG_BRAND_BTN : REG_OUTLINE_BTN,
                )}
                onClick={() => {
                  setCategory(c.id);
                  setOffset(0);
                  setQ('');
                }}
              >
                <c.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:gap-4">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
                placeholder="Title, owner…"
              />
            </div>
          </label>
          <label className="w-full shrink-0 space-y-1 lg:w-44">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 w-full">
              <option value="all">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </label>
          <div className="flex w-full shrink-0 gap-2 lg:w-auto lg:pl-2">
            <button
              type="button"
              className={cn('h-10 flex-1 rounded-lg px-4 text-sm font-semibold lg:min-w-[7.5rem] lg:flex-none', REG_BRAND_BTN)}
              onClick={() => {
                setForm({ status: 'PENDING', priority: 'MEDIUM' });
                setCreateOpen(true);
              }}
            >
              New item
            </button>
            <button
              type="button"
              className={cn('h-10 flex-1 rounded-lg px-4 text-sm font-semibold lg:min-w-[7.5rem] lg:flex-none', REG_OUTLINE_BTN)}
              onClick={exportCsv}
            >
              Export
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader className="border-b border-sgvu-navy/10 pb-3">
          <CardTitle className="text-base font-bold text-sgvu-navy">{category}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No governance items in this category.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.task_id}>
                        <TableCell>
                          <p className="font-medium text-sgvu-navy">{r.title}</p>
                          {r.body ? <p className="line-clamp-1 text-xs text-muted-foreground">{r.body}</p> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('border-transparent text-[11px]', priorityClass(r.priority))}>
                            {r.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('border-transparent text-[11px]', statusClass(r.status))}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(r.due_date)}</TableCell>
                        <TableCell className="text-sm">{r.owner_name ?? '—'}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSelected(r)}>
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-sgvu-navy/10 p-4">
                <PaginationBar total={filtered.length} limit={PAGE} offset={offset} onPageChange={setOffset} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={statusClass(selected.status)}>{selected.status}</Badge>
                <Badge variant="outline" className={priorityClass(selected.priority)}>{selected.priority}</Badge>
              </div>
              {selected.body ? <p className="text-muted-foreground">{selected.body}</p> : null}
              <p><span className="text-muted-foreground">Owner:</span> {selected.owner_name ?? '—'}</p>
              <p><span className="text-muted-foreground">Due:</span> {fmtDate(selected.due_date)}</p>
              {selected.decision_remarks ? (
                <p className="rounded-lg border border-sgvu-navy/10 bg-slate-50/80 p-3">{selected.decision_remarks}</p>
              ) : null}
              {selected.status.toUpperCase() === 'PENDING' ? (
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Decision remarks</span>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    rows={3}
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder="Optional notes for the record…"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="flex-wrap gap-2">
            {selected?.status.toUpperCase() === 'PENDING' ? (
              <>
                <Button className={REG_BRAND_BTN} disabled={deciding} onClick={() => void decide('APPROVED')}>
                  Approve
                </Button>
                <Button variant="outline" className="text-red-700" disabled={deciding} onClick={() => void decide('REJECTED')}>
                  Reject
                </Button>
              </>
            ) : null}
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New {category} item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Title</span><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Description</span><textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={3} value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Owner</span><Input value={form.owner_name ?? ''} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Due date</span><Input type="date" value={form.due_date?.slice(0, 10) ?? ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Priority</span>
              <Select value={form.priority ?? 'MEDIUM'} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="h-10">
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className={REG_BRAND_BTN} disabled={saving} onClick={() => void saveTask()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RegistrarDeskChrome>
  );
}
