'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, QrCode } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type BlockedDate, type CampusEvent, type Venue } from '@/lib/api/api.campus-events';

function tierLabel(ev: CampusEvent) {
  return `Faculty:${ev.advisor_approval ?? '—'} · HOD:${ev.hod_approval ?? '—'} · Dean:${ev.dean_approval ?? '—'} · Finance:${ev.finance_approval ?? '—'}`;
}

export default function ClubManagementPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [clubs, setClubs] = useState<{ club_id: string; name: string }[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [blocked, setBlocked] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'propose' | 'events' | 'scanner'>('propose');
  const [scanEventId, setScanEventId] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [scanStats, setScanStats] = useState<{ registered: number; attended: number } | null>(null);
  const [form, setForm] = useState({
    club_id: '',
    title: '',
    description: '',
    guest_speakers: '',
    venue_id: '',
    event_date: '',
    total_slots: 50,
    is_paid: false,
    ticket_price: 500,
    funds_needed: 0,
    venue_text: '',
  });

  const blockedSet = useMemo(() => new Set(blocked.map((b) => b.date.slice(0, 10))), [blocked]);

  const load = useCallback(async () => {
    const [c, e, v, b] = await Promise.all([
      eventsApi.myClubs(),
      eventsApi.coordinatorEvents(),
      eventsApi.venues(),
      eventsApi.blockedDates(),
    ]);
    setClubs(c);
    setEvents(e);
    setVenues(v);
    setBlocked(b);
    if (c[0]) setForm((f) => (f.club_id ? f : { ...f, club_id: c[0].club_id }));
    const live = e.filter((x) => x.status === 'LIVE');
    if (live[0] && !scanEventId) setScanEventId(live[0].event_id);
  }, [eventsApi, scanEventId]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Club management unavailable'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!scanEventId) return;
    void eventsApi.scanStats(scanEventId).then(setScanStats).catch(() => setScanStats(null));
  }, [scanEventId, eventsApi]);

  function validateDate() {
    const day = form.event_date.slice(0, 10);
    if (day && blockedSet.has(day)) {
      const hit = blocked.find((b) => b.date.startsWith(day));
      toast.error(`Date blocked: ${hit?.title ?? 'University calendar'}`);
      return false;
    }
    return true;
  }

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!form.club_id || !form.title || !form.event_date || (!form.venue_id && !form.venue_text.trim())) {
      toast.error('Club, title, venue, and date are required');
      return;
    }
    if (!validateDate()) return;
    setSubmitting(true);
    try {
      await eventsApi.proposeEvent({
        club_id: form.club_id,
        title: form.title,
        description: form.description || undefined,
        guest_speakers: form.guest_speakers || undefined,
        venue_id: form.venue_id || undefined,
        venue: form.venue_text.trim() || undefined,
        event_date: new Date(form.event_date).toISOString(),
        total_slots: Number(form.total_slots),
        is_paid: form.is_paid,
        ticket_price: form.is_paid ? Number(form.ticket_price) : 0,
        funds_needed: Number(form.funds_needed) || 0,
      });
      toast.success('Submitted — faculty coordinator will review');
      setForm((f) => ({ ...f, title: '', description: '', guest_speakers: '', event_date: '' }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not propose event');
    } finally {
      setSubmitting(false);
    }
  }

  async function scan() {
    if (!scanEventId || !qrInput.trim()) return;
    try {
      const res = await eventsApi.scanTicket(scanEventId, qrInput.trim());
      toast.success(res.duplicate ? `${res.student_name} already checked in` : `Checked in ${res.student_name}`);
      setQrInput('');
      const stats = await eventsApi.scanStats(scanEventId);
      setScanStats(stats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed');
    }
  }

  if (loading) {
    return <StudentLoadingState label="Loading club management…" />;
  }

  if (clubs.length === 0) {
    return (
      <StudentPageShell>
        <StudentPageHeader title="Club Management" description="Coordinator access only." />
        <StudentEmptyState title="Access restricted" description="You are not assigned as a club coordinator." />
      </StudentPageShell>
    );
  }

  const liveEvents = events.filter((e) => e.status === 'LIVE');

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Club Management"
        description="Propose ad-hoc events, track multi-tier approvals, and scan QR tickets on event day."
      />

      <StudentTabBar
        tabs={[
          { id: 'propose' as const, label: 'Propose' },
          { id: 'events' as const, label: 'My events', count: events.length },
          { id: 'scanner' as const, label: 'Scanner', count: liveEvents.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'propose' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Propose new event
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {blocked.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                <p className="font-semibold">Master calendar — blocked dates</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {blocked.map((b) => (
                    <span key={b.date} className="rounded bg-amber-100 px-1.5 py-0.5">
                      {b.date.slice(0, 10)}: {b.title}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
            <form className="grid gap-4 md:grid-cols-2" onSubmit={(ev) => void propose(ev)}>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Club</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.club_id}
                  onChange={(e) => setForm((f) => ({ ...f, club_id: e.target.value }))}
                >
                  {clubs.map((c) => (
                    <option key={c.club_id} value={c.club_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Guest speakers</label>
                <Input value={form.guest_speakers} onChange={(e) => setForm((f) => ({ ...f, guest_speakers: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Venue</label>
                {venues.length > 0 ? (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.venue_id}
                    onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))}
                  >
                    <option value="">Select venue or enter below</option>
                    {venues.map((v) => (
                      <option key={v.venue_id} value={v.venue_id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Input
                  value={form.venue_text}
                  onChange={(e) => setForm((f) => ({ ...f, venue_text: e.target.value }))}
                  placeholder="Venue name (e.g. Innovation Lab)"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date & time (unblocked only)</label>
                <Input
                  type="datetime-local"
                  value={form.event_date}
                  onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                  onBlur={validateDate}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Total slots</label>
                <Input
                  type="number"
                  min={1}
                  value={form.total_slots}
                  onChange={(e) => setForm((f) => ({ ...f, total_slots: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="paid"
                  checked={form.is_paid}
                  onChange={(e) => setForm((f) => ({ ...f, is_paid: e.target.checked }))}
                />
                <label htmlFor="paid" className="text-sm font-medium">Paid registration for attendees</label>
              </div>
              {form.is_paid ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ticket price (₹)</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.ticket_price}
                    onChange={(e) => setForm((f) => ({ ...f, ticket_price: Number(e.target.value) }))}
                  />
                </div>
              ) : null}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Funds needed from university (₹)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.funds_needed}
                  onChange={(e) => setForm((f) => ({ ...f, funds_needed: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Internal budget for logistics, equipment, etc. Separate from attendee ticket pricing. Leave 0 if no transfer needed.
                </p>
              </div>
              <Button type="submit" className="md:col-span-2 bg-sgvu-navy" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for faculty coordinator approval'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'events' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Club events & approval pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.map((ev) => (
              <div key={ev.event_id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{ev.title}</p>
                  <Badge>{ev.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{tierLabel(ev)}</p>
                {ev.status === 'LIVE' ? (
                  <button
                    type="button"
                    className="mt-2 text-sgvu-navy underline"
                    onClick={() =>
                      void eventsApi.attendeesCsv(ev.event_id).then((csv) => {
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `attendees-${ev.event_id.slice(0, 8)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                    }
                  >
                    Download CSV
                  </button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'scanner' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5" />
              Door scanner (LIVE events)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="flex h-10 w-full rounded-md border px-3 text-sm"
              value={scanEventId}
              onChange={(e) => setScanEventId(e.target.value)}
            >
              {liveEvents.map((e) => (
                <option key={e.event_id} value={e.event_id}>
                  {e.title}
                </option>
              ))}
            </select>
            {scanStats ? (
              <p className="text-sm text-muted-foreground">
                Checked in {scanStats.attended} / {scanStats.registered} registered · IQAC SODECA credits on scan
              </p>
            ) : null}
            <Input
              placeholder="Scan or paste FALCON-EVT-… QR code"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void scan()}
            />
            <Button className="bg-sgvu-navy" onClick={() => void scan()} disabled={!liveEvents.length}>
              Mark attendance
            </Button>
            {liveEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No LIVE events yet — complete the approval chain first.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </StudentPageShell>
  );
}
