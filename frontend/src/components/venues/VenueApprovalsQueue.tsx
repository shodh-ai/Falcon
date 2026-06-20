'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  createVenueBookingApi,
  type PendingVenueBooking,
} from '@/lib/api/api.venue-booking';

type VenueApprovalsApi = ReturnType<typeof createVenueBookingApi>;

export function VenueApprovalsQueue({
  title,
  description,
  loadPending,
  approve,
  reject,
}: {
  title: string;
  description: string;
  loadPending: (venueApi: VenueApprovalsApi) => Promise<PendingVenueBooking[]>;
  approve: (venueApi: VenueApprovalsApi, id: string, remarks?: string) => Promise<unknown>;
  reject: (venueApi: VenueApprovalsApi, id: string, remarks?: string) => Promise<unknown>;
}) {
  const api = useAuthedApi();
  const venueApi = useMemo(() => createVenueBookingApi(api), [api]);
  const [pending, setPending] = useState<PendingVenueBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await loadPending(venueApi);
    setPending(rows);
  }, [venueApi, loadPending]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load venue requests'))
      .finally(() => setLoading(false));
  }, [load]);

  async function onApprove(bookingId: string) {
    setBusy(bookingId);
    try {
      await approve(venueApi, bookingId);
      toast.success('Venue booking approved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setBusy(null);
    }
  }

  async function onReject(bookingId: string) {
    setBusy(bookingId);
    try {
      await reject(venueApi, bookingId, remarks.trim() || undefined);
      toast.success('Venue booking rejected');
      setRejectId(null);
      setRemarks('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading venue requests…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black text-sgvu-navy">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No pending venue requests in your queue.
          </CardContent>
        </Card>
      ) : (
        pending.map((row) => (
          <Card key={row.booking_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{row.venue_name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {row.student_name}
                  {row.semester ? ` · Sem ${row.semester}` : ''}
                </p>
              </div>
              <Badge variant="outline">{row.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-medium">{row.purpose}</p>
              <p className="text-muted-foreground">
                {new Date(row.start_time).toLocaleString()} – {new Date(row.end_time).toLocaleTimeString()}
              </p>
              {rejectId === row.booking_id ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Rejection remarks (e.g. room under maintenance)"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={busy === row.booking_id} onClick={() => void onReject(row.booking_id)}>
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRemarks(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy === row.booking_id} onClick={() => void onApprove(row.booking_id)}>
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === row.booking_id} onClick={() => setRejectId(row.booking_id)}>
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
