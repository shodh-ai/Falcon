'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Calendar, Medal, Ticket } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi, type CampusEvent, type EventRegistration } from '@/lib/api/api.campus-events';

type ExtraData = {
  records: { activity_type: string; details: string; credits_awarded: number; event_date: string; verification_status?: string }[];
  totals: { activity_type: string; credits: number }[];
};

type Tab = 'events' | 'points';

export default function FalconEventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'points' ? 'points' : 'events');
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [tickets, setTickets] = useState<EventRegistration[]>([]);
  const [extra, setExtra] = useState<ExtraData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cal, tk, ex] = await Promise.all([
      eventsApi.globalCalendar(),
      eventsApi.myTickets(),
      api.get<ExtraData>('/api/student/extracurriculars'),
    ]);
    setEvents(cal.live_events);
    setTickets(tk);
    setExtra(ex);
  }, [api, eventsApi]);

  useEffect(() => {
    void load().catch(() => toast.error('Could not load Falcon Events')).finally(() => setLoading(false));
  }, [load]);

  async function register(eventId: string) {
    try {
      const res = await eventsApi.register(eventId);
      if (res.checkout_required && res.registration.registration_id) {
        router.push(`/student/events/checkout?registrationId=${res.registration.registration_id}`);
        return;
      }
      toast.success('Registered for event!');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    }
  }

  if (loading) return <StudentLoadingState label="Loading Falcon Events…" />;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Falcon Events"
        description="Club fests, hackathons, and your NCC/NSS/SODECA points — one tabbed hub."
      />

      <StudentTabBar
        tabs={[
          { id: 'events', label: 'Club Events & Fests', count: events.length },
          { id: 'points', label: 'My Extra-Curricular Points' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'events' ? (
        <div className="space-y-4">
          {events.length === 0 ? (
            <StudentEmptyState title="No upcoming events" description="Check back for fests and workshops." icon={Calendar} />
          ) : (
            events.map((ev) => (
              <Card key={ev.event_id} className="overflow-hidden">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold text-sgvu-navy">{ev.title}</p>
                    <p className="text-sm text-muted-foreground">{ev.club_name ?? 'Campus Club'} · {new Date(ev.event_date).toLocaleString()}</p>
                    {ev.is_paid ? <Badge className="mt-2">Paid — ₹{ev.ticket_price}</Badge> : <Badge variant="success" className="mt-2">Free</Badge>}
                  </div>
                  <Button onClick={() => void register(ev.event_id)}>Register</Button>
                </CardContent>
              </Card>
            ))
          )}
          {tickets.length > 0 && (
            <StudentSectionCard title="My tickets" icon={Ticket}>
              <div className="space-y-2">
                {tickets.map((t) => (
                  <p key={t.registration_id} className="text-sm">
                    {t.title ?? 'Event'} · {t.event_date ? new Date(t.event_date).toLocaleString() : '—'} — {t.status}
                    {t.qr_code ? ` · QR ${t.qr_code}` : ''}
                  </p>
                ))}
              </div>
            </StudentSectionCard>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {(extra?.totals ?? []).map((t) => (
              <StudentStatCard
                key={t.activity_type}
                label={t.activity_type}
                value={`${t.credits} pts`}
                icon={Medal}
                tone={t.credits > 0 ? 'success' : 'default'}
              />
            ))}
          </div>
          <StudentSectionCard title="Activity log" icon={Activity}>
            {(extra?.records ?? []).length === 0 ? (
              <StudentEmptyState title="No activities logged" description="Upload NCC/NSS/SODECA certificates to earn points." />
            ) : (
              <div className="space-y-2">
                {extra!.records.map((r, i) => (
                  <div key={i} className="flex justify-between rounded-xl border p-3 text-sm">
                    <span>{r.activity_type}: {r.details}</span>
                    <Badge variant="outline">{r.verification_status ?? 'PENDING'}</Badge>
                  </div>
                ))}
              </div>
            )}
            <Button asChild variant="outline" className="mt-4">
              <a href="/student/extracurriculars">Log new activity</a>
            </Button>
          </StudentSectionCard>
        </div>
      )}
    </StudentPageShell>
  );
}
