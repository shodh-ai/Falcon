'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Clock, Users } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import {
  createVenueBookingApi,
  type CampusVenue,
  type VenueBooking,
  type VenueBookingPass,
  type VenueBookingSlot,
} from '@/lib/api/api.venue-booking';

type Tab = 'browse' | 'bookings';

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 60;

function toDateInput(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function slotLabel(hour: number) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:00 ${ampm}`;
}

function buildSlotTimes(date: string, hour: number) {
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function slotStatus(
  hour: number,
  date: string,
  bookings: VenueBookingSlot[],
): 'available' | 'pending' | 'booked' {
  const { start, end } = buildSlotTimes(date, hour);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  for (const b of bookings) {
    const bStart = new Date(b.start_time).getTime();
    const bEnd = new Date(b.end_time).getTime();
    if (startMs < bEnd && endMs > bStart) {
      return b.status === 'APPROVED' ? 'booked' : 'pending';
    }
  }
  return 'available';
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'APPROVED') return 'default';
  if (status === 'PENDING_APPROVAL') return 'secondary';
  if (status === 'REJECTED' || status === 'EXPIRED') return 'destructive';
  return 'outline';
}

export default function StudentVenuesPage() {
  const api = useAuthedApi();
  const venueApi = useMemo(() => createVenueBookingApi(api), [api]);
  const [tab, setTab] = useState<Tab>('browse');
  const [venues, setVenues] = useState<CampusVenue[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<CampusVenue | null>(null);
  const [selectedDate, setSelectedDate] = useState(toDateInput());
  const [slots, setSlots] = useState<VenueBookingSlot[]>([]);
  const [selectedSlotHour, setSelectedSlotHour] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [myBookings, setMyBookings] = useState<VenueBooking[]>([]);
  const [pass, setPass] = useState<VenueBookingPass | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadCatalog = useCallback(async () => {
    const [venueRows, tagRows, bookingRows] = await Promise.all([
      venueApi.listVenues(activeTag ?? undefined),
      venueApi.amenityTags(),
      venueApi.myBookings(),
    ]);
    setVenues(venueRows);
    setTags(tagRows);
    setMyBookings(bookingRows);
  }, [venueApi, activeTag]);

  const loadSlots = useCallback(async () => {
    if (!selectedVenue) return;
    const avail = await venueApi.availability(selectedVenue.venue_id, selectedDate);
    setSlots(avail.bookings);
  }, [venueApi, selectedVenue, selectedDate]);

  useEffect(() => {
    void loadCatalog()
      .catch(() => toast.error('Could not load venues'))
      .finally(() => setLoading(false));
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedVenue) return;
    void loadSlots().catch(() => toast.error('Could not load availability'));
  }, [loadSlots, selectedVenue]);

  async function submitBooking() {
    if (!selectedVenue || selectedSlotHour === null) {
      toast.error('Select a venue and time slot');
      return;
    }
    if (!purpose.trim()) {
      toast.error('Enter the purpose of your booking');
      return;
    }
    const { start, end } = buildSlotTimes(selectedDate, selectedSlotHour);
    const durationMins = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
    if (durationMins > selectedVenue.max_duration_mins) {
      toast.error(`Maximum booking duration is ${selectedVenue.max_duration_mins} minutes`);
      return;
    }

    setBusy(true);
    try {
      await venueApi.createBooking({
        venue_id: selectedVenue.venue_id,
        start_time: start,
        end_time: end,
        purpose: purpose.trim(),
      });
      toast.success('Booking request submitted — awaiting authority approval');
      setPurpose('');
      setSelectedSlotHour(null);
      await loadCatalog();
      await loadSlots();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
  }

  async function showPass(bookingId: string) {
    try {
      const p = await venueApi.bookingPass(bookingId);
      setPass(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load room pass');
    }
  }

  if (loading) return <StudentLoadingState label="Loading campus venues…" />;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Venue Booking"
        description="Book GD rooms, classrooms, and seminar halls for academic group work. Slots are locked on approval."
      />

      <StudentTabBar
        tabs={[
          { id: 'browse', label: 'Discover & Book' },
          { id: 'bookings', label: 'My Bookings', count: myBookings.length },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'browse' ? (
        <div className="space-y-6">
          <StudentSectionCard title="Filter by amenity">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`rounded-full px-3 py-1 text-sm ${activeTag === null ? 'bg-sgvu-navy text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                All spaces
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(tag)}
                  className={`rounded-full px-3 py-1 text-sm ${activeTag === tag ? 'bg-sgvu-navy text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </StudentSectionCard>

          <div className="grid gap-4 sm:grid-cols-2">
            {venues.map((v) => (
              <Card
                key={v.venue_id}
                className={`cursor-pointer transition hover:border-sgvu-gold ${selectedVenue?.venue_id === v.venue_id ? 'border-sgvu-gold ring-1 ring-sgvu-gold/30' : ''}`}
                onClick={() => {
                  setSelectedVenue(v);
                  setSelectedSlotHour(null);
                }}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-sgvu-navy/10 p-2 text-sgvu-navy">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sgvu-navy">{v.name}</p>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> Capacity {v.capacity}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(v.amenities ?? []).map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Max {v.max_duration_mins} min · Approver: {v.approver_role.replace(/_/g, ' ')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {venues.length === 0 ? (
            <StudentEmptyState title="No bookable venues" description="Try clearing filters or check back later." />
          ) : null}

          {selectedVenue ? (
            <StudentSectionCard title={`${selectedVenue.name} — daily timeline`}>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" value={selectedDate} min={toDateInput()} onChange={(e) => setSelectedDate(e.target.value)} />
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-200" /> Available</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-200" /> Pending</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-300" /> Booked</span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i).map((hour) => {
                  const status = slotStatus(hour, selectedDate, slots);
                  const isPast =
                    new Date(buildSlotTimes(selectedDate, hour).start).getTime() < Date.now();
                  const disabled = status !== 'available' || isPast;
                  return (
                    <button
                      key={hour}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedSlotHour(hour)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedSlotHour === hour
                          ? 'border-sgvu-gold bg-sgvu-gold/10'
                          : status === 'booked'
                            ? 'border-red-300 bg-red-100 opacity-90'
                            : status === 'pending'
                              ? 'border-amber-200 bg-amber-50 opacity-80'
                              : isPast
                                ? 'border-slate-200 bg-slate-100 opacity-60'
                                : 'border-emerald-200 bg-emerald-50 hover:border-emerald-400'
                      }`}
                    >
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5" /> {slotLabel(hour)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {disabled ? (isPast ? 'Past' : status === 'booked' ? 'Booked' : 'Requested') : 'Tap to select'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedSlotHour !== null ? (
                <div className="mt-4 space-y-3 rounded-lg border border-sgvu-gold/30 bg-sgvu-gold/5 p-4">
                  <p className="text-sm font-medium">
                    Request {slotLabel(selectedSlotHour)} – {slotLabel(selectedSlotHour + 1)} on {selectedDate}
                  </p>
                  <Input
                    placeholder='Purpose (e.g. "Final Year Project Discussion")'
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                  <Button disabled={busy} onClick={() => void submitBooking()}>
                    Request booking
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You can have at most 2 active or pending bookings. Overlapping slots are blocked automatically.
                  </p>
                </div>
              ) : null}
            </StudentSectionCard>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {myBookings.length === 0 ? (
            <StudentEmptyState title="No bookings yet" description="Browse venues and request a slot for your study group." />
          ) : (
            myBookings.map((b) => (
              <Card key={b.booking_id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-sgvu-navy">{b.venue_name}</p>
                    <p className="text-sm text-muted-foreground">{b.purpose}</p>
                    <p className="mt-1 text-sm">
                      {new Date(b.start_time).toLocaleString()} – {new Date(b.end_time).toLocaleTimeString()}
                    </p>
                    {b.approver_remarks ? (
                      <p className="mt-1 text-sm text-amber-700">Remarks: {b.approver_remarks}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(b.status)}>{b.status.replace(/_/g, ' ')}</Badge>
                    {b.status === 'APPROVED' ? (
                      <Button size="sm" variant="outline" onClick={() => void showPass(b.booking_id)}>
                        Room pass
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {pass ? (
            <StudentSectionCard title="Digital room pass">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <QRCode value={pass.qr_payload} size={140} />
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-sgvu-navy">{pass.venue_name}</p>
                  <p>{pass.student_name}</p>
                  <p className="text-muted-foreground">
                    {new Date(pass.start_time).toLocaleString()} – {new Date(pass.end_time).toLocaleTimeString()}
                  </p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{pass.qr_payload}</p>
                </div>
              </div>
              <Button className="mt-3" variant="outline" size="sm" onClick={() => setPass(null)}>
                Close pass
              </Button>
            </StudentSectionCard>
          ) : null}
        </div>
      )}
    </StudentPageShell>
  );
}
