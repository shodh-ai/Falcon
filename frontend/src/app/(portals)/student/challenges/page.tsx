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
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { void c.list().then(setList).catch(() => toast.error('Load failed')); }, [c]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Tokamak Challenges</h1>
      <p className="text-sm text-muted-foreground">Submit a whitepaper URL to enter the Gladiator funnel.</p>
      {list.map((x) => (
        <Card key={x.competition_id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{x.title}</CardTitle></CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => c.submit({ competition_id: x.competition_id, whitepaper_url: 'https://example.com/whitepaper.pdf', applicant_name: 'Student Applicant' }).then(() => toast.success('Submitted')).catch((e) => toast.error(String(e.message ?? e)))}>Submit whitepaper</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
