'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Loader2, Ticket } from 'lucide-react';
import QRCode from 'react-qr-code';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent, type EventRegistration } from '@/lib/api/api.campus-events';

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function slotsLeft(event: CampusEvent) {
  const bookable = event.bookable_slots ?? event.available_slots - (event.pending_holds ?? 0);
  return Math.max(0, bookable);
}

export default function StudentEventsPage() {
  const router = useRouter();
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [blockedDates, setBlockedDates] = useState<{ date: string; title: string }[]>([]);
  const [tickets, setTickets] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);
  const [freshTicket, setFreshTicket] = useState<EventRegistration | null>(null);
  const [tab, setTab] = useState<'discover' | 'tickets'>('discover');

  const load = useCallback(async () => {
    const [cal, tk] = await Promise.all([eventsApi.globalCalendar(), eventsApi.myTickets()]);
    setEvents(cal.live_events);
    setBlockedDates(cal.blocked_dates);
    setTickets(tk);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load events'))
      .finally(() => setLoading(false));
  }, [load]);

  const calendarByMonth = useMemo(() => {
    const map = new Map<string, CampusEvent[]>();
    for (const e of events) {
      const key = new Date(e.event_date).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()];
  }, [events]);

  async function register(event: CampusEvent) {
    if (slotsLeft(event) <= 0) return;
    setRegistering(event.event_id);
    try {
      const res = await eventsApi.register(event.event_id);
      if (res.checkout_required && res.registration?.registration_id) {
        router.push(`/student/events/checkout?registrationId=${res.registration.registration_id}`);
        return;
      }
      setFreshTicket(res.registration);
      toast.success('Ticket confirmed!');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setRegistering(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StudentPageHeader
        title="Falcon Events"
        description="Global campus calendar — LIVE events only, after the full approval chain."
      />

      {blockedDates.length > 0 ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">University blocked dates: </span>
          {blockedDates.map((b) => b.title).join(' · ')}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant={tab === 'discover' ? 'default' : 'outline'} onClick={() => setTab('discover')}>
          Discover
        </Button>
        <Button variant={tab === 'tickets' ? 'default' : 'outline'} onClick={() => setTab('tickets')}>
          My Tickets
        </Button>
      </div>

      {tab === 'discover' ? (
        <div className="space-y-6">
          {calendarByMonth.map(([month, monthEvents]) => (
            <div key={month}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {month}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {monthEvents.map((event) => {
                  const left = slotsLeft(event);
                  const soldOut = left <= 0;
                  const pct =
                    event.total_slots > 0
                      ? Math.round(((event.total_slots - left) / event.total_slots) * 100)
                      : 100;
                  return (
                    <Card key={event.event_id} className="border-border/80">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg">{event.title}</CardTitle>
                          {event.is_paid ? (
                            <Badge variant="secondary">₹{Number(event.ticket_price)}</Badge>
                          ) : (
                            <Badge className="bg-emerald-600">Free</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{event.club_name}</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm">{formatEventDate(event.event_date)}</p>
                        {event.venue ? <p className="text-sm text-muted-foreground">{event.venue}</p> : null}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{soldOut ? 'Sold out' : `Only ${left} slots left`}</span>
                            <span>{pct}% filled</span>
                          </div>
                          <Progress value={pct} className="h-2" />
                        </div>
                        <Button
                          className="w-full"
                          disabled={soldOut || registering === event.event_id}
                          onClick={() => void register(event)}
                        >
                          {registering === event.event_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : soldOut ? (
                            'Sold Out'
                          ) : event.is_paid ? (
                            'Book pass'
                          ) : (
                            'Register free'
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming approved events yet.</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {freshTicket?.qr_code ? (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardHeader>
                <CardTitle className="text-base">Your new ticket</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <QRCode value={freshTicket.qr_code} size={160} />
                <p className="font-mono text-sm">{freshTicket.qr_code}</p>
              </CardContent>
            </Card>
          ) : null}
          {tickets.map((t) => (
            <Card key={t.registration_id}>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Ticket className="h-5 w-5 text-sgvu-gold" />
                <div>
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t.club_name}</p>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1 text-sm">
                  <p>{t.event_date ? formatEventDate(t.event_date) : ''}</p>
                  {t.venue ? <p className="text-muted-foreground">{t.venue}</p> : null}
                </div>
                {t.qr_code ? (
                  <div className="flex flex-col items-center gap-1 rounded-lg border bg-background p-3">
                    <QRCode value={t.qr_code} size={120} />
                    <span className="font-mono text-xs">{t.qr_code}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {tickets.length === 0 && !freshTicket ? (
            <p className="text-sm text-muted-foreground">No tickets yet — explore Discover to register.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
