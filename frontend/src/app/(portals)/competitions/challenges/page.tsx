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
  useEffect(() => { void c.list().then(setList).catch(() => toast.error('Load failed')); }, [c]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Active Challenges</h1>
      {list.map((x) => (
        <Card key={x.competition_id}><CardHeader><CardTitle>{x.title}</CardTitle></CardHeader>
          <CardContent className="text-sm">{x.description}</CardContent></Card>
      ))}
    </div>
  );
}
