'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent, type Venue } from '@/lib/api/api.campus-events';
import { toast } from '@/lib/notifications/falcon-toast';

type Tab = 'pending' | 'live';

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function display(value?: string | number | null) {
  if (value == null || value === '') return '—';
  return String(value);
}

function eventVenue(event: CampusEvent) {
  return event.venue ?? event.venue_asset_name ?? '—';
}

export function CampusAdminEventsPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);

  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<CampusEvent[]>([]);
  const [live, setLive] = useState<CampusEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<CampusEvent | null>(null);
  const [venueId, setVenueId] = useState('');
  const [estateNotes, setEstateNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRows, liveRows, venueRows] = await Promise.all([
        eventsApi.estatePending(),
        eventsApi.listEvents(),
        eventsApi.venues(),
      ]);
      setPending(Array.isArray(pendingRows) ? pendingRows : []);
      setLive(Array.isArray(liveRows) ? liveRows : []);
      setVenues(Array.isArray(venueRows) ? venueRows : []);
    } catch (err) {
      setPending([]);
      setLive([]);
      setVenues([]);
      setError(parseApiError(err) || 'Unable to load campus events.');
    } finally {
      setLoading(false);
    }
  }, [eventsApi]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setVenueId('');
      setEstateNotes('');
      setRejectReason('');
      return;
    }
    setVenueId(selected.venue_id ?? '');
    setEstateNotes('');
    setRejectReason('');
  }, [selected]);

  const pendingFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return pending.filter((event) => {
      if (filter === 'clash' && !event.venue_clash?.has_clash) return false;
      if (filter === 'paid' && !event.is_paid) return false;
      if (filter === 'free' && event.is_paid) return false;
      if (
        term &&
        !`${event.title} ${event.club_name ?? ''} ${eventVenue(event)} ${event.guest_speakers ?? ''}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [filter, pending, q]);

  const liveFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return live.filter((event) => {
      if (filter === 'paid' && !event.is_paid) return false;
      if (filter === 'free' && event.is_paid) return false;
      if (
        term &&
        !`${event.title} ${event.club_name ?? ''} ${eventVenue(event)}`.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [filter, live, q]);

  const stats = useMemo(
    () => ({
      pending: pending.length,
      clashes: pending.filter((event) => event.venue_clash?.has_clash).length,
      live: live.length,
    }),
    [live.length, pending],
  );

  const approve = async () => {
    if (!selected) return;
    setActing(true);
    try {
      await eventsApi.approveEstate(selected.event_id, {
        venue_id: venueId || undefined,
        estate_notes: estateNotes.trim() || undefined,
      });
      toast.success(selected.is_paid ? 'Sent to Finance for approval' : 'Event is now live');
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!selected || rejectReason.trim().length < 3) {
      toast.error('Enter a rejection reason (min 3 characters)');
      return;
    }
    setActing(true);
    try {
      await eventsApi.rejectEstate(selected.event_id, rejectReason.trim());
      toast.success('Event rejected');
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setActing(false);
    }
  };

  const rows = tab === 'pending' ? pendingFiltered : liveFiltered;

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review club event venue requests and monitor live campus events.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <StatChip label="Pending approval" value={loading ? '—' : stats.pending} />
        <StatChip label="Venue clashes" value={loading ? '—' : stats.clashes} />
        <StatChip label="Live events" value={loading ? '—' : stats.live} />
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex rounded-xl border border-gray-200 bg-white p-1">
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${tab === 'pending' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setTab('pending')}
                  >
                    Pending approval
                  </button>
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${tab === 'live' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setTab('live')}
                  >
                    Live events
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1 sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search event, club, or venue..."
                      className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                    />
                  </div>
                  <Select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-44"
                  >
                    <option value="">All events</option>
                    {tab === 'pending' ? <option value="clash">Venue clash only</option> : null}
                    <option value="paid">Paid events</option>
                    <option value="free">Free events</option>
                  </Select>
                </div>
              </div>

              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading events…
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="p-3 font-medium">Event</th>
                        <th className="p-3 font-medium">Club</th>
                        <th className="p-3 font-medium">Date</th>
                        <th className="p-3 font-medium">Venue</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            {tab === 'pending'
                              ? 'No events awaiting estate approval.'
                              : 'No live events on this campus.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((event) => (
                          <tr key={event.event_id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="p-3 font-semibold text-sgvu-navy">{display(event.title)}</td>
                            <td className="p-3">{display(event.club_name)}</td>
                            <td className="p-3 whitespace-nowrap">{formatDateTime(event.event_date)}</td>
                            <td className="p-3">{eventVenue(event)}</td>
                            <td className="p-3">
                              {tab === 'pending' ? (
                                <div className="flex flex-wrap gap-1">
                                  {event.venue_clash?.has_clash ? (
                                    <Badge variant="warning">Clash</Badge>
                                  ) : (
                                    <Badge variant="secondary">Awaiting estate</Badge>
                                  )}
                                  {event.is_paid ? <Badge variant="outline">Paid</Badge> : null}
                                </div>
                              ) : (
                                <Badge variant="success">Live</Badge>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                className="text-sm font-semibold text-sgvu-navy hover:underline"
                                onClick={() => setSelected(event)}
                              >
                                {tab === 'pending' ? 'Review' : 'View'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          {selected ? (
            tab === 'pending' ? (
              <ReviewPanel
                event={selected}
                venues={venues}
                venueId={venueId}
                setVenueId={setVenueId}
                estateNotes={estateNotes}
                setEstateNotes={setEstateNotes}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                acting={acting}
                onApprove={() => void approve()}
                onReject={() => void reject()}
              />
            ) : (
              <ViewPanel event={selected} />
            )
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sgvu-navy/10 bg-slate-50 px-2.5 py-1">
      <span>{label}</span>
      <span className="font-semibold text-sgvu-navy">{value}</span>
    </span>
  );
}

function ReviewPanel({
  event,
  venues,
  venueId,
  setVenueId,
  estateNotes,
  setEstateNotes,
  rejectReason,
  setRejectReason,
  acting,
  onApprove,
  onReject,
}: {
  event: CampusEvent;
  venues: Venue[];
  venueId: string;
  setVenueId: (value: string) => void;
  estateNotes: string;
  setEstateNotes: (value: string) => void;
  rejectReason: string;
  setRejectReason: (value: string) => void;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Estate review</p>
        <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">{event.title}</SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">
          {display(event.club_name)} · {formatDateTime(event.event_date)}
        </SheetDescription>
        <div className="mt-2 flex flex-wrap gap-2">
          {event.venue_clash?.has_clash ? <Badge variant="warning">Venue clash</Badge> : null}
          {event.is_paid ? <Badge variant="outline">Paid · Finance next</Badge> : <Badge variant="success">Goes live on approve</Badge>}
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        {event.venue_clash?.has_clash ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Venue clash detected</p>
              {event.venue_clash.conflicts.map((conflict) => (
                <p key={`${conflict.title}-${conflict.event_date}`} className="mt-1 text-xs">
                  {conflict.title} · {formatDateTime(conflict.event_date)}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <Section title="Event">
          <Field label="Club" value={event.club_name} />
          <Field label="Requested venue" value={eventVenue(event)} />
          <Field label="Guests" value={event.guest_speakers} />
          <Field label="Description" value={event.description} wide />
          <Field label="Ticket" value={event.is_paid ? `Paid · ${display(event.ticket_price)}` : 'Free'} />
          <Field label="Capacity" value={event.total_slots} />
        </Section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Venue decision</h3>
          <div className="space-y-3">
            <Select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="h-10 w-full rounded-xl border-sgvu-navy/15"
            >
              <option value="">Select confirmed venue</option>
              {venues.map((venue) => (
                <option key={venue.venue_id} value={venue.venue_id}>
                  {venue.name}
                  {venue.location_label ? ` · ${venue.location_label}` : ''}
                </option>
              ))}
            </Select>
            <Input
              value={estateNotes}
              onChange={(e) => setEstateNotes(e.target.value)}
              placeholder="Estate notes (optional)"
              className="h-10 rounded-xl border-sgvu-navy/15"
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">Reject</h3>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason"
            className="h-10 rounded-xl border-sgvu-navy/15"
          />
        </section>

        <div className="flex flex-wrap gap-2 border-t border-sgvu-navy/10 pt-4">
          <Button className="h-9" disabled={acting} onClick={onApprove}>
            <CheckCircle2 className="h-4 w-4" />
            Approve venue
          </Button>
          <Button className="h-9" variant="destructive" disabled={acting} onClick={onReject}>
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewPanel({ event }: { event: CampusEvent }) {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Live event</p>
        <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">{event.title}</SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">
          {display(event.club_name)} · {formatDateTime(event.event_date)}
        </SheetDescription>
        <Badge className="mt-2 w-fit" variant="success">
          Live
        </Badge>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        <Section title="Event">
          <Field label="Venue" value={eventVenue(event)} />
          <Field label="Guests" value={event.guest_speakers} />
          <Field label="Description" value={event.description} wide />
          <Field label="Ticket" value={event.is_paid ? `Paid · ${display(event.ticket_price)}` : 'Free'} />
          <Field label="Total slots" value={event.total_slots} />
          <Field label="Available slots" value={event.available_slots} />
          <Field label="Capacity" value={event.capacity_percent != null ? `${event.capacity_percent}%` : null} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string | number | null;
  wide?: boolean;
}) {
  const text = display(value);
  return (
    <div className={`rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-sgvu-navy">{text}</dd>
    </div>
  );
}
