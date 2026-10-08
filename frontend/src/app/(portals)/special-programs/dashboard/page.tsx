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
  useEffect(() => { void sp.list().then(setRows).catch(() => toast.error('Load failed')); }, [sp]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Special Programs</h1>
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((p) => (
          <Card key={p.program_id}><CardHeader className="pb-2"><CardTitle className="text-base">{p.name}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{p.description}</CardContent></Card>
        ))}
      </div>
    </div>
  );
}
