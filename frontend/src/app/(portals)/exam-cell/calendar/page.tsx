'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { ExamCalendar, type CalendarEvent } from '@/components/exam-cell/ExamCalendar';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canExamCellAction } from '@/lib/exam-cell-rbac';

const EVENT_TYPES = [
  'ACADEMIC', 'MID_SEMESTER', 'END_SEMESTER', 'PRACTICAL', 'VIVA', 'HOLIDAY',
  'HALL_TICKET_RELEASE', 'RESULT_DECLARATION', 'REVALUATION', 'SUPPLEMENTARY', 'DEADLINE', 'OTHER',
];

export default function ExamCellCalendarPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const canManage = canExamCellAction(user?.roles ?? user?.role, 'manage_schedules');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [form, setForm] = useState({ title: '', event_type: 'DEADLINE', event_date: '', description: '' });

  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().slice(0, 10);
    return { from, to };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (filterType) qs.set('event_type', filterType);
      if (filterSem) qs.set('semester', filterSem);
      setEvents(await api.get<CalendarEvent[]>(`/api/exam-cell/calendar/events?${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [api, range, filterType, filterSem]);

  useEffect(() => { void load(); }, [load]);

  async function createEvent() {
    if (!form.title || !form.event_date) {
      toast.error('Title and date required');
      return;
    }
    try {
      await api.post('/api/exam-cell/calendar/events', form);
      toast.success('Calendar event created');
      setForm((f) => ({ ...f, title: '', description: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  }

  async function reschedule(eventId: string, eventDate: string) {
    if (!eventId.startsWith('schedule-')) {
      try {
        await api.post(`/api/exam-cell/calendar/events/${eventId}/reschedule`, { event_date: eventDate });
        toast.success('Event rescheduled');
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Reschedule failed');
      }
    }
  }

  const filtered = filterType
    ? events.filter((e) => e.event_type === filterType)
    : events;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="calendar" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex gap-2">
            <Select className="rounded-md border px-2 py-1 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
            <Select className="rounded-md border px-2 py-1 text-sm" value={filterSem} onChange={(e) => setFilterSem(e.target.value)}>
              <option value="">All semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Sem {s}</option>)}
            </Select>
          </div>
        </CardHeader>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Add calendar milestone</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="sm:col-span-2 lg:col-span-1" />
              <Select className="rounded-md border px-3 py-2 text-sm" value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </Select>
              <Input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div className="flex justify-center">
              <Button onClick={() => void createEvent()}>
                <Plus className="mr-2 h-4 w-4" />
                Add event
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
            <ExamCalendar events={filtered} onReschedule={(id, d) => void reschedule(id, d)} draggable={canManage} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
