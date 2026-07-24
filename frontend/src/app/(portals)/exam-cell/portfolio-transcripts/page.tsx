'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createSpecialProgramsApi } from '@/lib/api/api.special-programs';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const sp = useMemo(() => createSpecialProgramsApi(api), [api]);
  const [arts, setArts] = useState<any[]>([]);
  useEffect(() => { void sp.artifacts().then(setArts).catch(() => toast.error('Load failed')); }, [sp]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Portfolio Transcripts</h1>
      <p className="text-sm text-muted-foreground">Artifacts replacing GPA-only graduation evidence.</p>
      {arts.map((a) => <Card key={a.artifact_id}><CardContent className="pt-4 text-sm">{a.student_name ?? a.student_user_id}: {a.artifact_type} — {a.title}</CardContent></Card>)}
    </div>
  );
}
