'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CounselingPage() {
  const api = useAuthedApi();
  const [seats, setSeats] = useState<Record<string, unknown>[]>([]);

  const load = () => {
    void api.get<Record<string, unknown>[]>('/api/admissions-crm/counseling/seats').then(setSeats).catch(() => setSeats([]));
  };

  useEffect(() => {
    load();
  }, [api]);

  const allot = async (code: string) => {
    try {
      await api.post(`/api/admissions-crm/counseling/seats/${encodeURIComponent(code)}/allot`, {});
      toast.success('Seat allotted — matrix updated globally');
      load();
    } catch {
      toast.error('No seats remaining');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Merit & Quota Counseling</h1>
      <p className="text-sm text-muted-foreground">Live seat matrix — counts decrease in real-time as booking payments are recorded.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {seats.map((s) => {
          const remaining = Number(s.remaining_seats ?? 0);
          const total = Number(s.total_seats ?? 0);
          const filled = Number(s.filled_seats ?? 0);
          return (
            <div key={String(s.seat_id)} className="rounded-xl border p-4">
              <p className="font-semibold">{String(s.program_name)}</p>
              <p className="mt-2 font-mono text-2xl text-sgvu-navy">
                {filled} / {total}
              </p>
              <p className="text-sm text-muted-foreground">{remaining} seats remaining</p>
              <Button size="sm" className="mt-3" disabled={remaining <= 0} onClick={() => void allot(String(s.program_code))}>
                Simulate Booking
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
