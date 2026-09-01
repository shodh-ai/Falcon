'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, ChevronDown, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  REG_BRAND_BTN,
  REG_OUTLINE_BTN,
} from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type AuditRow = {
  audit_id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  details?: unknown;
  created_at: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  ip_address?: string | null;
};

type AuditResponse = {
  items: AuditRow[];
  limit: number;
  offset: number;
  total?: number;
  stats?: { today: number; logins_today: number };
};

const ACTION_FILTERS = [
  'ALL',
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'ASSIGN_ROLE',
  'ACTIVATE',
  'DEACTIVATE',
  'RESET_PASSWORD',
] as const;

const PAGE = 25;

const TABLE_HEAD =
  'h-11 border-b border-sgvu-navy/10 bg-white px-4 text-left align-middle text-xs font-semibold text-sgvu-navy/70';
const CELL = 'px-4 py-3.5 align-middle text-sm text-sgvu-navy';

function fmtWhen(value: string) {
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function parseDetailsObject(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { message: details };
    }
  }
  return null;
}

function isFailed(details: unknown) {
  const obj = parseDetailsObject(details);
  if (!obj) return false;
  const raw = obj.result ?? obj.status ?? obj.success ?? obj.error;
  if (raw === false || raw === 'FAILED' || raw === 'failed' || raw === 'error') return true;
  return typeof raw === 'string' && /fail|error/i.test(raw);
}

function humanizeResource(value: string) {
  return value.replace(/_/g, ' ');
}

function describeEvent(row: AuditRow) {
  const action = row.action.replace(/_/g, ' ').toLowerCase();
  const resource = humanizeResource(row.resource_type);
  return `${action} · ${resource}`;
}

function describeDetails(row: AuditRow) {
  const obj = parseDetailsObject(row.details);
  if (!obj || Object.keys(obj).length === 0) {
    return row.resource_id ? `Reference: ${row.resource_id}` : 'No extra notes';
  }
  for (const key of ['name', 'title', 'email', 'role', 'source']) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  const first = Object.entries(obj)[0];
  if (!first) return 'Change recorded';
  const [, val] = first;
  return typeof val === 'string' ? val : 'Change recorded';
}

function formatPayload(details: unknown) {
  const obj = parseDetailsObject(details);
  if (!obj) return '—';
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(details);
  }
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyText(label: string, value?: string | null) {
  if (!value?.trim()) {
    toast.warning(`No ${label} to copy`);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy to clipboard');
  }
}

export function AdminAuditLogPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ today: 0, logins_today: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<(typeof ACTION_FILTERS)[number]>('ALL');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const fetchLogs = useCallback(
    async (q: string, act: (typeof ACTION_FILTERS)[number], off: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE));
        params.set('offset', String(off));
        if (q.trim()) params.set('q', q.trim());
        if (act !== 'ALL') params.set('action', act);
        const data = await api.get<AuditResponse>(
          `/api/admin-control/audit-logs?${params.toString()}`,
        );
        setItems(data.items ?? []);
        setTotal(data.total ?? data.items?.length ?? 0);
        setStats(data.stats ?? { today: 0, logins_today: 0 });
      } catch (err) {
        setItems([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void fetchLogs(query, action, offset);
  }, [fetchLogs, query, action, offset]);

  function applySearch() {
    const next = queryInput.trim();
    setOffset(0);
    if (next === query) {
      void fetchLogs(next, action, 0);
    } else {
      setQuery(next);
    }
  }

  function clearFilters() {
    setQueryInput('');
    setQuery('');
    setAction('ALL');
    setOffset(0);
  }

  function refreshList() {
    void fetchLogs(query, action, offset);
  }

  async function exportLogs() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      params.set('offset', '0');
      if (query.trim()) params.set('q', query.trim());
      if (action !== 'ALL') params.set('action', action);
      const data = await api.get<AuditResponse>(
        `/api/admin-control/audit-logs?${params.toString()}`,
      );
      const rows = data.items ?? [];
      if (!rows.length) {
        toast.warning('Nothing to export for the current filters');
        return;
      }
      downloadCsv(
        'audit-logs.csv',
        ['When', 'Who', 'Email', 'Event', 'Notes'],
        rows.map((r) => [
          fmtWhen(r.created_at),
          r.actor_name ?? 'System',
          r.actor_email ?? '',
          describeEvent(r),
          describeDetails(r),
        ]),
      );
      toast.success(`Exported ${rows.length} event${rows.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setExporting(false);
    }
  }

  const hasFilters = query.trim().length > 0 || action !== 'ALL';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Admin Control Center
            </p>
            <h1 className="mt-1 text-2xl font-bold text-sgvu-navy sm:text-3xl">Audit Logs</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track who changed what in the admin portal.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 border-t border-sgvu-navy/5 pt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total events</p>
              <p className="text-lg font-bold text-sgvu-navy">{loading ? '—' : total}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-lg font-bold text-sgvu-navy">{loading ? '—' : stats.today}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Logins today</p>
              <p className="text-lg font-bold text-sgvu-navy">
                {loading ? '—' : stats.logins_today}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                placeholder="Search by name, email, or resource"
                className="h-10 pl-9"
              />
            </div>
            <Select
              value={action}
              onChange={(e) => {
                setOffset(0);
                setAction(e.target.value as (typeof ACTION_FILTERS)[number]);
              }}
              className="h-10 w-full sm:w-40"
            >
              {ACTION_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All actions' : option.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className={cn('h-9', REG_BRAND_BTN)}
              onClick={applySearch}
              disabled={loading}
            >
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn('h-9 gap-1.5', REG_OUTLINE_BTN)}
              onClick={refreshList}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn('h-9', REG_OUTLINE_BTN)}
              onClick={() => void exportLogs()}
              disabled={loading || exporting}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Export CSV'}
            </Button>
            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                className={cn('h-9', REG_OUTLINE_BTN)}
                onClick={clearFilters}
                disabled={loading}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-20 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="space-y-3 px-6 py-20 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button type="button" className={REG_BRAND_BTN} onClick={refreshList}>
                Try again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="space-y-3 px-6 py-20 text-center">
              <p className="text-sm text-muted-foreground">No events match your search.</p>
              {hasFilters ? (
                <Button type="button" variant="outline" className={REG_OUTLINE_BTN} onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TABLE_HEAD}>When</TableHead>
                    <TableHead className={TABLE_HEAD}>Who</TableHead>
                    <TableHead className={TABLE_HEAD}>Event</TableHead>
                    <TableHead className={TABLE_HEAD}>Notes</TableHead>
                    <TableHead className={cn(TABLE_HEAD, 'text-right')}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.audit_id} className="border-sgvu-navy/5">
                      <TableCell className={cn(CELL, 'whitespace-nowrap text-muted-foreground')}>
                        {fmtWhen(row.created_at)}
                      </TableCell>
                      <TableCell className={CELL}>
                        <p className="font-medium">{row.actor_name || 'System'}</p>
                        {row.actor_email ? (
                          <p className="text-xs text-muted-foreground">{row.actor_email}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className={CELL}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="capitalize">{describeEvent(row)}</span>
                          {isFailed(row.details) ? (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                              Failed
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className={cn(CELL, 'max-w-xs truncate text-muted-foreground')}>
                        {describeDetails(row)}
                      </TableCell>
                      <TableCell className={cn(CELL, 'text-right')}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              className={cn('h-8 gap-1.5 px-3 text-xs font-semibold', REG_BRAND_BTN)}
                            >
                              View
                              <ChevronDown className="h-3.5 w-3.5 opacity-90" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                              Audit actions
                            </DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setSelected(row)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => void copyText('Audit ID', row.audit_id)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy audit ID
                            </DropdownMenuItem>
                            {row.resource_id ? (
                              <DropdownMenuItem
                                onSelect={() => void copyText('Reference ID', row.resource_id)}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copy reference ID
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-sgvu-navy/5 px-4 py-3">
                <PaginationBar
                  total={total}
                  limit={PAGE}
                  offset={offset}
                  onPageChange={setOffset}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Event details</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">When</dt>
                  <dd className="mt-0.5 font-medium">{fmtWhen(selected.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Action</dt>
                  <dd className="mt-0.5 font-medium capitalize">
                    {selected.action.replace(/_/g, ' ').toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Who</dt>
                  <dd className="mt-0.5 font-medium">{selected.actor_name || 'System'}</dd>
                  <dd className="text-xs text-muted-foreground">
                    {selected.actor_email || selected.actor_user_id || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Resource</dt>
                  <dd className="mt-0.5 font-medium capitalize">
                    {humanizeResource(selected.resource_type)}
                  </dd>
                </div>
              </dl>

              {(selected.resource_id || selected.ip_address) && (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {selected.resource_id ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Reference ID</dt>
                      <dd className="mt-0.5 break-all font-mono text-xs">{selected.resource_id}</dd>
                    </div>
                  ) : null}
                  {selected.ip_address ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">IP address</dt>
                      <dd className="mt-0.5">{selected.ip_address}</dd>
                    </div>
                  ) : null}
                </dl>
              )}

              <div>
                <p className="text-xs text-muted-foreground">Full record</p>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border bg-slate-50 p-3 text-xs leading-relaxed">
                  {formatPayload(selected.details)}
                </pre>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            {selected?.resource_id ? (
              <Button
                type="button"
                variant="outline"
                className={REG_OUTLINE_BTN}
                onClick={() => void copyText('Reference ID', selected.resource_id)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy ID
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className={REG_OUTLINE_BTN}
              onClick={() => setSelected(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
