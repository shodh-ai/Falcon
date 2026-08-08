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
  const [program, setProgram] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  useEffect(() => {
    void sp.list().then((all) => {
      const p = all.find((x) => x.code === 'WETWARE_BIOTECH');
      setProgram(p);
      if (p) return sp.enrollments('WETWARE_BIOTECH').then(setEnrollments);
    }).catch(() => toast.error('Load failed'));
  }, [sp]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Wetware Biotech</h1>
      <p className="text-sm text-muted-foreground">{program?.description}</p>
      {program && <Button onClick={() => sp.enroll({ program_id: program.program_id, metadata: { track: 'BioBricks' } }).then(() => sp.enrollments('WETWARE_BIOTECH').then(setEnrollments)).catch((e) => toast.error(String(e.message ?? e)))}>Enroll self</Button>}
      {enrollments.map((e) => <Card key={e.enrollment_id}><CardContent className="pt-4 text-sm">{e.student_name} — {e.status}</CardContent></Card>)}
    </div>
  );
}
