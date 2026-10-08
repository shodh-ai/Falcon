'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createCompetitionsApi } from '@/lib/api/api.competitions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const c = useMemo(() => createCompetitionsApi(api), [api]);
  const [list, setList] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any[]>([]);
  useEffect(() => {
    void Promise.all([c.list(), c.funnel().catch(() => [])]).then(([l, f]) => { setList(l); setFunnel(f); }).catch(() => toast.error('Load failed'));
  }, [c]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Tokamak Challenges</h1>
      <div className="grid gap-3 md:grid-cols-3">
        {list.map((x) => (
          <Card key={x.competition_id}><CardHeader className="pb-2"><CardTitle className="text-base">{x.title}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{x.status} — {x.description}</CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
        <CardContent className="text-sm">{funnel.map((f, i) => <div key={i}>{f.stage} / {f.status}: {f.count}</div>)}</CardContent></Card>
    </div>
  );
}
