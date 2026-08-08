'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createCompetitionsApi } from '@/lib/api/api.competitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const c = useMemo(() => createCompetitionsApi(api), [api]);
  const [entries, setEntries] = useState<any[]>([]);
  const reload = () => c.entries().then(setEntries).catch(() => toast.error('Load failed'));
  useEffect(() => { void reload(); }, [c]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Funnel & Golden Tickets</h1>
      {entries.map((e) => (
        <Card key={e.entry_id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{e.applicant_name ?? e.applicant_email ?? e.entry_id} — {e.stage}/{e.status}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {e.golden_ticket_code && <span className="text-sm font-mono">{e.golden_ticket_code}</span>}
            <Button size="sm" variant="outline" onClick={() => c.advance(e.entry_id, { stage: 'TOP20_LOCKDOWN', status: 'SHORTLISTED' }).then(reload)}>Top 20</Button>
            <Button size="sm" onClick={() => c.goldenTicket(e.entry_id).then(reload).catch((err) => toast.error(String(err.message ?? err)))}>Golden Ticket</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
