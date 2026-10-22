'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi } from '@/lib/api/api.ecell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Panelist = { panelist_id: string; panelist_name: string; panel_role: string; official_email: string | null; course_offering_id?: string | number | null };

export default function ProductVivaPanelPage() {
  const api = useAuthedApi();
  const ecell = useMemo(() => createEcellApi(api), [api]);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ api: typeof api; revision: number; rows: Panelist[]; error: string | null } | null>(null);
  const currentResult = result?.api === api && result.revision === revision ? result : null;
  const loading = !currentResult;
  const error = currentResult?.error;
  const rows = currentResult?.rows ?? [];

  useEffect(() => {
    let current = true;
    void ecell
      .listProductVivaPanelists()
      .then((rows: Panelist[]) => {
        if (current) setResult({ api, revision, rows, error: null });
      }).catch((cause: unknown) => {
        if (current) setResult({ api, revision, rows: [], error: cause instanceof Error ? cause.message : 'Failed to load Product Viva panel' });
      });
    return () => { current = false; };
  }, [api, ecell, revision]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Semester-End Product Viva</h1>
        <p className="text-sm text-muted-foreground">
          Panel of VC, industry, and Shodh judges — replaces standard written end-term for UROP fellows.
        </p>
      </div>
      <div className="grid gap-3">
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading Product Viva panel…</p>}
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setRevision((current) => current + 1)}>Retry Product Viva panel</Button>
          </div>
        )}
        {rows.map((p) => (
          <Card key={p.panelist_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {p.panelist_name} — {p.panel_role}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {p.official_email}
              {p.course_offering_id ? ` · offering ${p.course_offering_id}` : ''}
            </CardContent>
          </Card>
        ))}
        {!loading && !error && !rows.length && (
          <p className="text-sm text-muted-foreground">
            No panelists assigned yet. Exam Cell / Dean can add VC, INDUSTRY, SHODH, or FACULTY roles via API.
          </p>
        )}
      </div>
    </div>
  );
}
