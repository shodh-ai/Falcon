'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { REG_OUTLINE_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
};

type AuditResponse = {
  items: AuditRow[];
  limit: number;
  offset: number;
};

const ACTION_FILTERS = [
  'ALL',
  'CREATE',
  'UPDATE',
  'ASSIGN_ROLE',
  'ACTIVATE',
  'DEACTIVATE',
  'RESET_PASSWORD',
  'DELETE',
] as const;

function formatDetails(details: unknown) {
  if (!details) return '—';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return '—';
  }
}

export function AdminAuditLogPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<(typeof ACTION_FILTERS)[number]>('ALL');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(25);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (query.trim()) params.set('q', query.trim());
      if (action !== 'ALL') params.set('action', action);
      const data = await api.get<AuditResponse>(`/api/admin-control/audit-logs?${params.toString()}`);
      setItems(data.items ?? []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [action, api, limit, offset, query]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (query.trim()) params.set('q', query.trim());
    if (action !== 'ALL') params.set('action', action);
    void api
      .get<AuditResponse>(`/api/admin-control/audit-logs?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [action, api, limit, offset, query]);

  const canGoPrev = offset > 0;
  const canGoNext = items.length === limit;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Admin Control Center
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
              Audit Logs
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Review actual administrative events recorded by the Admin Control audit pipeline.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search actor or resource"
                className="h-11 pl-9"
              />
            </div>
            <Select
              value={action}
              onChange={(e) => {
                setLoading(true);
                setOffset(0);
                setAction(e.target.value as (typeof ACTION_FILTERS)[number]);
              }}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              {ACTION_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All actions' : option}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              className={cn('h-11', REG_OUTLINE_BTN)}
              onClick={() => {
                setLoading(true);
                setOffset(0);
                setQuery(queryInput);
              }}
            >
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading audit logs…
            </div>
          ) : error ? (
            <div className="space-y-4 px-6 py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="space-y-3 px-6 py-16 text-center">
              <p className="font-semibold text-sgvu-navy">No audit events found</p>
              <p className="text-sm text-muted-foreground">
                Try a different action filter or a broader search term.
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 md:p-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.audit_id} className="border-sgvu-navy/5 align-top">
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(row.created_at).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-sgvu-navy">
                            {row.actor_name || 'System / Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">{row.actor_user_id || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-sgvu-navy/15 bg-slate-50 text-sgvu-navy">
                          {row.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="uppercase tracking-wide text-muted-foreground">
                        {row.resource_type}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.resource_id || '—'}
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                          {formatDetails(row.details)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  Showing {offset + 1}-{offset + items.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canGoPrev}
                    onClick={() => {
                      setLoading(true);
                      setOffset((prev) => Math.max(0, prev - limit));
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canGoNext}
                    onClick={() => {
                      setLoading(true);
                      setOffset((prev) => prev + limit);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
