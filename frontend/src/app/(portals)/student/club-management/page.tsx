'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import {
  BlockedDatesDialog,
  ClubEventsPanel,
  ClubScannerPanel,
  ProposeEventPanel,
  type ProposeFormState,
} from '@/components/student/club/ClubManagementViews';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type BlockedDate, type CampusEvent, type Venue } from '@/lib/api/api.campus-events';

function normalizeEventQrCode(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/FALCON-EVT-[A-F0-9]+/i);
  if (match) return match[0].toUpperCase();
  return trimmed;
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scanEventId, setScanEventId] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [scanStats, setScanStats] = useState<{ registered: number; attended: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{
    ok: boolean;
    studentName?: string;
    duplicate?: boolean;
    message: string;
  } | null>(null);
  const [form, setForm] = useState<ProposeFormState>({
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

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (!form.club_id || !form.title || !form.event_date || (!form.venue_id && !form.venue_text.trim())) {
      toast.error('Club, title, venue, and date are required');
      return;
    }
    const day = form.event_date.slice(0, 10);
    if (day && blockedSet.has(day)) {
      const hit = blocked.find((b) => b.date.startsWith(day));
      toast.error(`Date blocked: ${hit?.title ?? 'University calendar'}`);
      return;
    }
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
    if (!scanEventId) {
      toast.error('Select a live event first');
      return;
    }
    const qrCode = normalizeEventQrCode(qrInput);
    if (!qrCode) {
      toast.error('Scan or paste a ticket QR code (FALCON-EVT-…)');
      return;
    }
    setScanning(true);
    setLastScan(null);
    try {
      const res = await eventsApi.scanTicket(scanEventId, qrCode);
      const message = res.duplicate
        ? `${res.student_name} was already checked in`
        : `Checked in ${res.student_name}`;
      setLastScan({ ok: true, studentName: res.student_name, duplicate: res.duplicate, message });
      toast.success(res.duplicate ? `${res.student_name} already checked in` : `Checked in ${res.student_name}`);
      setQrInput('');
      const stats = await eventsApi.scanStats(scanEventId);
      setScanStats(stats);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Scan failed';
      setLastScan({ ok: false, message });
      toast.error(message);
    } finally {
      setScanning(false);
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

  const liveEvents = events.filter((ev) => ev.status === 'LIVE');

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Club Management"
        description="Propose events, track approvals, and scan tickets on event day."
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
        <ProposeEventPanel
          clubs={clubs}
          venues={venues}
          blocked={blocked}
          form={form}
          setForm={setForm}
          submitting={submitting}
          onSubmit={(ev) => void propose(ev)}
          onOpenCalendar={() => setCalendarOpen(true)}
        />
      ) : null}

      {tab === 'events' ? (
        <ClubEventsPanel
          events={events}
          onDownloadCsv={(eventId) =>
            void eventsApi.attendeesCsv(eventId).then((csv) => {
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `attendees-${eventId.slice(0, 8)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            })
          }
        />
      ) : null}

      {tab === 'scanner' ? (
        <ClubScannerPanel
          liveEvents={liveEvents}
          scanEventId={scanEventId}
          setScanEventId={setScanEventId}
          qrInput={qrInput}
          setQrInput={setQrInput}
          scanStats={scanStats}
          scanning={scanning}
          lastScan={lastScan}
          onScan={() => void scan()}
        />
      ) : null}

      <BlockedDatesDialog open={calendarOpen} onOpenChange={setCalendarOpen} blocked={blocked} />
    </StudentPageShell>
  );
}
