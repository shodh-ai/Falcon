'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const reload = () => sp.hsDirect().then(setRows).catch(() => toast.error('Load failed'));
  useEffect(() => { void reload(); }, [sp]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">HS Direct Admissions</h1>
      <Button onClick={() => sp.createHsDirect({ email: 'hacker@school.edu', grade_level: '12', checklist: { whitepaper: true, github: true } }).then(reload)}>Add HS Direct lead</Button>
      {rows.map((r) => <Card key={r.flag_id}><CardContent className="pt-4 text-sm">{r.email} · grade {r.grade_level} · bypass JEE: {String(r.bypass_jee)}</CardContent></Card>)}
    </div>
  );
}
