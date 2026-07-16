'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
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

export default function ExamCellAuditLogPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (actionFilter.trim()) qs.set('action', actionFilter.trim());
      setRows(await api.get<AuditRow[]>(`/api/exam-cell/audit-log?${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [api, actionFilter]);

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
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.audit_id} emptyMessage="No audit events recorded yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
