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
  const [rows, setRows] = useState<any[]>([]);
  const reload = () => c.bounties().then(setRows).catch(() => toast.error('Load failed'));
  useEffect(() => { void reload(); }, [c]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Bounties</h1>
      {rows.map((b) => (
        <Card key={b.bounty_id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{b.title} — ₹{Number(b.reward_inr).toLocaleString('en-IN')}</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <span className="text-sm">{b.status}</span>
            {b.status === 'OPEN' && <Button size="sm" onClick={() => c.claimBounty(b.bounty_id).then(reload)}>Claim</Button>}
            {b.status === 'CLAIMED' && <Button size="sm" onClick={() => c.payBounty(b.bounty_id).then(reload)}>Mark Paid</Button>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
