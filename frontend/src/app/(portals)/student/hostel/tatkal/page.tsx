'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type Bed = {
  bed_id: string;
  bed_number: string;
  hostel_block: string;
  room_number: string;
  display_status: string;
  is_premium: boolean;
};

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500',
  IN_CART: 'bg-amber-400',
  BOOKED: 'bg-red-600',
};

export default function HostelTatkalPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [beds, setBeds] = useState<Bed[]>([]);
  const [hold, setHold] = useState<{ hold_id: string; bed_id: string; expires_at: string } | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const load = () => void api.get<Bed[]>('/api/hostel-tatkal/map').then(setBeds);

  useEffect(() => {
    load();
    const socket: Socket = io(`${apiUrl}/hostel-tatkal`, { transports: ['websocket'] });
    socket.emit('joinSale', { tenant_id: user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001' });
    socket.on('bed.update', (payload: { bed_id: string; display_status: string }) => {
      setBeds((prev) =>
        prev.map((b) => (b.bed_id === payload.bed_id ? { ...b, display_status: payload.display_status } : b)),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [api, apiUrl, user?.tenant_id]);

  async function selectBed(bedId: string) {
    try {
      const res = await api.post<{ hold_id: string; bed_id: string; expires_at: string }>('/api/hostel-tatkal/lock-bed', {
        bed_id: bedId,
      });
      setHold(res);
      toast.success('Bed locked for 5 minutes — complete payment');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bed unavailable');
    }
  }

  async function confirmPayment() {
    if (!hold) return;
    try {
      await api.post('/api/hostel-tatkal/confirm-payment', {
        hold_id: hold.hold_id,
        payment_ref: `MOCK-${Date.now()}`,
      });
      toast.success('Hostel bed confirmed!');
      setHold(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed');
    }
  }

  const legend = useMemo(
    () => [
      { label: 'Available', color: STATUS_COLOR.AVAILABLE },
      { label: 'In cart (5 min lock)', color: STATUS_COLOR.IN_CART },
      { label: 'Booked', color: STATUS_COLOR.BOOKED },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Tatkal Hostel Booking"
        description="Real-time bed map with Redis concurrency lock. First student to select gets a 5-minute payment window."
      />
      <div className="flex flex-wrap gap-4 text-xs">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-full ${l.color}`} />
            {l.label}
          </span>
        ))}
      </div>
      {hold && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-center justify-between py-4 text-sm">
            <span>Bed locked until {new Date(hold.expires_at).toLocaleTimeString()}</span>
            <Button onClick={() => void confirmPayment()}>Pay & confirm (mock)</Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {beds.map((bed) => (
          <button
            key={bed.bed_id}
            type="button"
            disabled={bed.display_status !== 'AVAILABLE'}
            title={`${bed.hostel_block} ${bed.room_number} · ${bed.bed_number}`}
            className={`rounded-lg p-3 text-xs font-medium text-white ${STATUS_COLOR[bed.display_status] ?? 'bg-gray-400'} disabled:opacity-60`}
            onClick={() => void selectBed(bed.bed_id)}
          >
            {bed.hostel_block}-{bed.room_number}-{bed.bed_number}
          </button>
        ))}
      </div>
    </div>
  );
}
