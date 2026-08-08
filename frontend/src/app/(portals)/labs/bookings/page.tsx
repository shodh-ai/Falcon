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
  const reload = () => labs.checkouts().then(setRows).catch(() => toast.error('Load failed'));
  useEffect(() => { void reload(); }, [labs]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Bookings & Checkout</h1>
      {rows.map((c) => (
        <Card key={c.checkout_id}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{c.equipment_name}</CardTitle></CardHeader>
          <CardContent className="flex gap-2 text-sm">
            <span>{c.user_name} · {c.returned_at ? 'Returned' : 'Out'}</span>
            {!c.returned_at && (
              <Button
                size="sm"
                onClick={() =>
                  labs
                    .returnCheckout(c.checkout_id)
                    .then(() => {
                      toast.success(`${c.equipment_name} returned`);
                      return reload();
                    })
                    .catch((err) => toast.error(String(err.message ?? err)))
                }
              >
                Return
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
