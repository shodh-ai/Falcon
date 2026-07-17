'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
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
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = Math.floor(offset / pageSize) + 1;
      const qs = new URLSearchParams({ limit: String(pageSize), page: String(page) });
      if (actionFilter.trim()) qs.set('search', actionFilter.trim());
      const payload = await api.get<AuditResponse>(`/api/exam-cell/audit-log?${qs}`);
      setRows(payload.data ?? []);
      setTotal(payload.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit log');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [api, actionFilter, offset]);

  useEffect(() => { void load(); }, [load]);

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
      <ExamCellPageHeader pageId="audit-log" actions={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      } />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Examination audit trail</CardTitle>
          <Input
            placeholder="Filter by action…"
            aria-label="Filter audit log by action"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading audit log" /> : (
            <>
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.audit_id} emptyMessage="No audit events recorded yet." />
              <PaginationBar
                total={total}
                limit={pageSize}
                offset={offset}
                onPageChange={setOffset}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
