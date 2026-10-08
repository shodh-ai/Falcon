'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

export type CampusAdminColumn = { key: string; label: string };

export function CampusAdminDirectory({
  title,
  description,
  endpoint,
  columns,
}: {
  title: string;
  description: string;
  endpoint: string;
  columns: CampusAdminColumn[];
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void api
      .get<unknown>(endpoint)
      .then((data) => {
        setRows(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
      })
      .catch((err: unknown) => {
        setRows([]);
        setError(err instanceof Error ? err.message : 'Could not load this campus view');
      })
      .finally(() => setLoading(false));
  }, [api, endpoint]);

  return (
    <div className="space-y-6 p-6">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.14),transparent_55%)]" />
          <div className="relative space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No records for your assigned campus.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    {columns.map((column) => (
                      <th key={column.key} className="p-3 font-medium">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, index) => (
                    <tr key={String(row.id ?? row.user_id ?? row.application_id ?? index)} className="hover:bg-muted/30">
                      {columns.map((column) => (
                        <td key={column.key} className="p-3">
                          {formatCell(row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-IN');
  }
  return String(value);
}
