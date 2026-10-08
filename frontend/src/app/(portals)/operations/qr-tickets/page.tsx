'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [locs, setLocs] = useState<any[]>([]);
  useEffect(() => {
    void ops.locations().then(setLocs).catch(() => toast.error('Load failed'));
  }, [ops]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">QR Ticketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Simulate a campus QR scan. After creating a ticket, resolve it from{' '}
          <Link href="/operations/esm" className="text-sgvu-navy underline">
            ESM Queues
          </Link>
          .
        </p>
      </div>
      {locs.map((l) => (
        <Card key={l.location_id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {l.label} ({l.qr_code})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={() =>
                ops
                  .fromQr({ qr_code: l.qr_code, subject: `${l.label} — facilities request` })
                  .then((t: any) =>
                    toast.success(
                      `Ticket ${t.ticket_ref ?? t.ticket_id} created — open ESM to scan-close`,
                    ),
                  )
                  .catch((e) => toast.error(String(e.message ?? e)))
              }
            >
              Create ticket from QR
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
