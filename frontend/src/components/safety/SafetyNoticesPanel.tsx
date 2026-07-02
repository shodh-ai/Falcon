'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { concernStatusLabel, concernTypeLabel } from '@/lib/student-safety';

type Notice = {
  concern_id: string;
  concern_type: string;
  status: string;
  accused_notified_at: string | null;
  resolution_summary?: string | null;
  created_at: string;
};

function noticeBody(row: Notice): string {
  if (row.status === 'RESOLVED' || row.status === 'CLOSED') {
    return row.resolution_summary?.trim()
      ? `This concern has been ${row.status.toLowerCase()}. ${row.resolution_summary.trim()}`
      : `This concern has been ${row.status.toLowerCase()} by the Disciplinary Committee.`;
  }
  return 'A confidential concern is under review. The Disciplinary Committee / ICC will contact you through official channels if your statement is required.';
}

export function SafetyNoticesPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Notice[]>('/api/student-safety/accused/notices');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Could not load safety notices');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No notices.</CardContent>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.concern_id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {concernTypeLabel(row.concern_type)}
              </CardTitle>
              <Badge>{concernStatusLabel(row.status as never)}</Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{noticeBody(row)}</p>
              {row.accused_notified_at ? (
                <p className="text-xs">
                  Official notice sent on{' '}
                  {new Date(row.accused_notified_at).toLocaleString('en-IN')}.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
