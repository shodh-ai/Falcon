'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type EventRow = { event_id: string; title: string; event_date: string; venue: string | null; rsvp_count: number };

export default function IqacAlumniEventsPage() {
  const api = useAuthedApi();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');

  const load = () => void api.get<EventRow[]>('/iqac/alumni/events').then(setEvents).catch(() => setEvents([]));

  useEffect(() => {
    load();
  }, [api]);

  async function create() {
    if (!title || !date) {
      toast.error('Title and date required');
      return;
    }
    try {
      await api.post('/iqac/alumni/events', { title, event_date: date, venue });
      toast.success('Event published to Alumni Portal');
      setTitle('');
      setDate('');
      setVenue('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <IqacPageHeader title="Alumni Event Manager" description="Publish meets and guest lectures to the alumni portal." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publish event</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <Button onClick={() => void create()}>Publish</Button>
        </CardContent>
      </Card>
      {events.map((e) => (
        <Card key={e.event_id}>
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">{e.title}</p>
            <p className="text-muted-foreground">
              {new Date(e.event_date).toLocaleString()} · {e.venue ?? 'TBA'} · RSVPs: {e.rsvp_count}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
