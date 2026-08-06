'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void sp.pop().then(setRows).catch(() => toast.error('Load failed')); }, [sp]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Professors of Practice</h1>
      {rows.map((p) => (
        <Card key={p.pop_id}><CardHeader className="pb-2"><CardTitle className="text-base">{p.user_name}</CardTitle></CardHeader>
          <CardContent className="text-sm">{p.title} · equity incentive {p.equity_incentive_pct}%</CardContent></Card>
      ))}
      {!rows.length && <p className="text-sm text-muted-foreground">No PoP profiles yet.</p>}
    </div>
  );
}
