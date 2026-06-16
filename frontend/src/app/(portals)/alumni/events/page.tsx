'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type EventRow = {
  event_id: string;
  title: string;
  event_date: string;
  venue: string | null;
  description: string | null;
  rsvp_status: string | null;
};

export default function AlumniEventsPage() {
  const api = useAuthedApi();
  const [events, setEvents] = useState<EventRow[]>([]);

  const load = () => void api.get<EventRow[]>('/api/alumni/events').then(setEvents).catch(() => setEvents([]));

  useEffect(() => {
    load();
  }, [api]);

  async function rsvp(eventId: string) {
    try {
      await api.post(`/api/alumni/events/${eventId}/rsvp`, {});
      toast.success('RSVP confirmed');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'RSVP failed');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader title="Alumni Events" description="Upcoming meets, guest lectures, and networking events." />
      {events.map((e) => (
        <Card key={e.event_id}>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{e.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(e.event_date).toLocaleString()} · {e.venue ?? 'TBA'}
              </p>
            </div>
            {e.rsvp_status && <Badge>RSVP: {e.rsvp_status}</Badge>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{e.description}</p>
            {!e.rsvp_status && (
              <Button size="sm" onClick={() => void rsvp(e.event_id)}>
                RSVP
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      {!events.length && <p className="text-sm text-muted-foreground">No upcoming events published.</p>}
    </div>
  );
}
