'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type AuditRow = {
  audit_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_name: string | null;
  created_at: string;
  new_value?: unknown;
};

type AuditResponse = {
  data: AuditRow[];
  total: number;
  limit: number;
  offset: number;
  page: number;
};

export default function ExamCellAuditLogPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const pageSize = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const page = Math.floor(offset / pageSize) + 1;
      const qs = new URLSearchParams({ limit: String(pageSize), page: String(page) });
      if (actionFilter.trim()) qs.set('search', actionFilter.trim());
      const payload = await api.get<AuditResponse>(`/api/exam-cell/audit-log?${qs}`);
      if (request !== latestRequest.current) return;
      setRows(payload.data ?? []);
      setTotal(payload.total ?? 0);
    } catch (e) {
      if (request !== latestRequest.current) return;
      const message = e instanceof Error ? e.message : 'Failed to load audit log';
      setError(message);
      toast.error(message);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [api, actionFilter, offset]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const columns: DataTableColumn<AuditRow>[] = [
    { key: 'action', header: 'Action', render: (r) => <span className="font-medium">{r.action.replace(/_/g, ' ')}</span> },
    { key: 'resource', header: 'Resource', render: (r) => (
      <div><p className="text-sm">{r.resource_type}</p><p className="font-mono text-xs text-muted-foreground">{r.resource_id?.slice(0, 8) ?? '—'}</p></div>
    ) },
    { key: 'actor', header: 'Actor', render: (r) => r.actor_name ?? 'System' },
    { key: 'when', header: 'Timestamp', render: (r) => (
      <Badge variant="outline">{new Date(r.created_at).toLocaleString('en-IN')}</Badge>
    ) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="audit-log" actions={
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          } />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Examination audit trail</CardTitle>
          <div className="w-full space-y-2 sm:max-w-xs">
          <label htmlFor="audit-action-filter" className="text-sm font-medium text-sgvu-navy">Filter by action</label>
          <Input
            id="audit-action-filter"
            placeholder="Filter by action…"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
          />
          </div>
        </CardHeader>
        <CardContent>
          {error ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>Retry</Button></div> : null}
          {loading ? <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading audit log…</div> : !error ? (
            <>
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.audit_id} emptyMessage={actionFilter.trim() ? 'No audit events match this action filter.' : 'No audit events recorded yet.'} />
              <div className="mt-4">
              <PaginationBar
                total={total}
                limit={pageSize}
                offset={offset}
                onPageChange={setOffset}
              />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
