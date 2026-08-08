'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi } from '@/lib/api/api.ecell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function IpAgreementsPage() {
  const api = useAuthedApi();
  const ecell = useMemo(() => createEcellApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    void ecell
      .listIpAgreements()
      .then(setRows)
      .catch(() => toast.error('Failed to load IP agreements'));
  }, [ecell]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Founder-First IP</h1>
        <p className="text-sm text-muted-foreground">
          Student lead inventor · SGVU pays filing fees · 5% equity · 3-year reversion
        </p>
      </div>
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.agreement_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {r.startup_name ?? r.project_id} — {r.status}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Inventor: {r.inventor_name ?? r.lead_inventor_user_id} · Equity{' '}
              {r.university_equity_pct}% · Legal fees paid by SGVU:{' '}
              {r.sgvu_pays_legal_fees ? 'Yes' : 'No'} · Reversion {r.reversion_years}y
            </CardContent>
          </Card>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">No IP agreements yet.</p>}
      </div>
    </div>
  );
}
