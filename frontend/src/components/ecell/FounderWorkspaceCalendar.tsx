'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellWorkspace, type EcellWorkspaceBooking } from '@/lib/api/api.ecell';
import { cn } from '@/lib/utils';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function overlapsHour(booking: EcellWorkspaceBooking, hour: number, day: string) {
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const slotStart = new Date(`${day}T${hourLabel(hour)}:00`);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  return start < slotEnd && end > slotStart;
}

export function FounderWorkspaceCalendar() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [workspaces, setWorkspaces] = useState<EcellWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookings, setBookings] = useState<EcellWorkspaceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [durationHours, setDurationHours] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [rooms, mine] = await Promise.all([ecellApi.workspaces(), ecellApi.myBookings()]);
    setWorkspaces(rooms);
    if (rooms[0] && !workspaceId) setWorkspaceId(rooms[0].workspace_id);
    void mine;
  }, [ecellApi, workspaceId]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load workspaces'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!workspaceId) return;
    void ecellApi
      .workspaceCalendar(workspaceId, date)
      .then(setBookings)
      .catch(() => setBookings([]));
  }, [ecellApi, workspaceId, date]);

  async function confirmBooking() {
    if (selectedHour == null || !workspaceId) return;
    const start = new Date(`${date}T${hourLabel(selectedHour)}:00`);
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    setSubmitting(true);
    try {
      await ecellApi.bookWorkspace({
        workspace_id: workspaceId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        purpose: purpose.trim() || 'Team session',
      });
      toast.success('Workspace booked');
      setSelectedHour(null);
      setPurpose('');
      const refreshed = await ecellApi.workspaceCalendar(workspaceId, date);
      setBookings(refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading workspace calendar…</p>;

  const day = date.slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide">Room</label>
          <Select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.workspace_id} value={w.workspace_id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <p className="text-xs text-muted-foreground">Max 4 hours of conference room time per startup per week.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {HOURS.map((hour) => {
              const booked = bookings.some((b) => overlapsHour(b, hour, day));
              const selected = selectedHour === hour;
              return (
                <button
                  key={hour}
                  type="button"
                  disabled={booked}
                  onClick={() => setSelectedHour(hour)}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition',
                    booked && 'cursor-not-allowed bg-red-50 text-red-700 border-red-100',
                    !booked && !selected && 'hover:border-sgvu-gold/40 hover:bg-muted/30',
                    selected && 'border-sgvu-gold ring-2 ring-sgvu-gold/30',
                  )}
                >
                  <span className="font-medium">{hourLabel(hour)} – {hourLabel(hour + 1)}</span>
                  <span>{booked ? 'Booked' : selected ? 'Selected' : 'Available'}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedHour != null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Book {hourLabel(selectedHour)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Purpose (e.g. Team Standup, Client Pitch)"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs font-medium">Duration (hours)</label>
              <Input
                type="number"
                min={1}
                max={4}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value) || 1)}
              />
            </div>
            <Button onClick={() => void confirmBooking()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm Booking
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
