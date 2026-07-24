'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [locs, setLocs] = useState<any[]>([]);
  useEffect(() => { void ops.locations().then(setLocs).catch(() => toast.error('Load failed')); }, [ops]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">QR Ticketing</h1>
      {locs.map((l) => (
        <Card key={l.location_id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{l.label} ({l.qr_code})</CardTitle></CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => ops.fromQr({ qr_code: l.qr_code }).then((t: any) => toast.success(`Ticket ${t.ticket_ref ?? t.ticket_id}`)).catch((e) => toast.error(String(e.message ?? e)))}>Create ticket from QR</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
