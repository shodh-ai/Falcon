'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function SpaceCalendarPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);

  const reload = () =>
    api.get<any[]>('/api/uos/space/bookings').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    void reload();
  }, [api]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Space DOFA Board</h1>
      <p className="text-sm text-muted-foreground">
        Club / auditorium bookings: Mentor → Estate (AC/chairs) → Security → Confirmed.
      </p>
      {rows.map((b) => (
        <div key={b.booking_id} className="flex flex-wrap gap-2 border-b py-2 text-sm items-center">
          <span>
            {b.venue_name || b.venue_id} · {b.purpose?.slice(0, 40)} ·{' '}
            {b.dofa_status || b.status}
          </span>
          <Button
            size="sm"
            onClick={() =>
              api
                .post(`/api/uos/space/bookings/${b.booking_id}/advance`)
                .then(() => {
                  toast.success('Advanced');
                  return reload();
                })
                .catch((e) => toast.error(String(e?.message ?? e)))
            }
          >
            Advance DOFA
          </Button>
        </div>
      ))}
      {!rows.length && (
        <p className="text-sm text-muted-foreground">No venue bookings yet.</p>
      )}
    </div>
  );
}
