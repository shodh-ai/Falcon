'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

export default function LibraryGatePage() {
  const api = useAuthedApi();
  const scanRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({ currently_inside: 0, entries_today: 0 });
  const [lastAction, setLastAction] = useState<string | null>(null);

  const loadStats = () => void api.get<typeof stats>('/api/library-admin/gate/stats').then(setStats);

  useEffect(() => {
    loadStats();
    scanRef.current?.focus();
    const id = window.setInterval(loadStats, 15000);
    return () => window.clearInterval(id);
  }, [api]);

  async function checkIn(barcode: string) {
    try {
      const res = await api.post<{ already_inside: boolean }>('/api/library-admin/gate/check-in', { barcode });
      setLastAction(res.already_inside ? 'Already inside' : 'Entry logged');
      toast.success(res.already_inside ? 'Patron already inside' : 'Welcome — entry logged');
      loadStats();
      if (scanRef.current) scanRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check-in failed');
    }
  }

  async function checkOut(barcode: string) {
    try {
      await api.post('/api/library-admin/gate/check-out', { barcode });
      setLastAction('Exit logged');
      toast.success('Exit logged — NAAC utilization updated');
      loadStats();
      if (scanRef.current) scanRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check-out failed');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-black text-sgvu-navy">Library Gate</h1>
        <p className="text-muted-foreground">Tap ID card — iPad kiosk mode</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-4xl font-black text-sgvu-navy">{stats.currently_inside}</p>
            <p className="text-xs uppercase text-muted-foreground">Inside now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-4xl font-black text-sgvu-gold">{stats.entries_today}</p>
            <p className="text-xs uppercase text-muted-foreground">Entries today</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-center text-base">Scan student / faculty ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={scanRef}
            autoFocus
            className="text-center text-lg"
            placeholder="Scan ID barcode"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const v = (e.target as HTMLInputElement).value;
              void checkIn(v);
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="h-16 bg-emerald-700 text-lg"
              onClick={() => scanRef.current?.value && void checkIn(scanRef.current.value)}
            >
              Entry
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 text-lg"
              onClick={() => scanRef.current?.value && void checkOut(scanRef.current.value)}
            >
              Exit
            </Button>
          </div>
          {lastAction && <p className="text-center text-sm font-medium text-muted-foreground">{lastAction}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
