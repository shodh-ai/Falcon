'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createLabsApi } from '@/lib/api/api.labs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const labs = useMemo(() => createLabsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const reload = () => labs.equipment().then(setRows).catch(() => toast.error('Load failed'));
  useEffect(() => { void reload(); }, [labs]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Zones & Equipment</h1>
      <div className="grid gap-3">
        {rows.map((e) => (
          <Card key={e.equipment_id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{e.name} · {e.zone_code}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3 text-sm">
              <span>{e.status} · {e.asset_tag}</span>
              {e.status === 'AVAILABLE' && (
                <Button size="sm" onClick={() => labs.checkout({ equipment_id: e.equipment_id, safety_ack: true }).then(reload).catch((err) => toast.error(String(err.message ?? err)))}>Checkout</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
