'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createLabsApi } from '@/lib/api/api.labs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const labs = useMemo(() => createLabsApi(api), [api]);
  const [b, setB] = useState<any>(null);
  useEffect(() => { void labs.budget().then(setB).catch(() => toast.error('Load failed')); }, [labs]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Tokamak Budget</h1>
      <Card><CardHeader><CardTitle>₹2L/mo corporate R&D fast-path</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Program: {b?.program_name ?? 'TOKAMAK_RND'}</p>
          <p>Allocated: ₹{Number(b?.allocated_amount ?? 0).toLocaleString('en-IN')}</p>
          <p>Encumbered: ₹{Number(b?.encumbered_amount ?? 0).toLocaleString('en-IN')}</p>
          <p>Utilized: ₹{Number(b?.utilized_amount ?? 0).toLocaleString('en-IN')}</p>
          <p>Fast-path DOFA: {b?.fast_path ? 'Enabled' : '—'}</p>
        </CardContent>
      </Card>
    </div>
  );
}
