'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const canManage = canExamCellAction([...(user?.roles ?? []), user?.primaryRole ?? '', user?.role ?? ''], 'manage_schedules');
  const [filterType, setFilterType] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [form, setForm] = useState({ title: '', event_type: 'DEADLINE', event_date: '', description: '' });
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{ api: typeof api | null; key: string; events: CalendarEvent[]; error: string | null }>({ api: null, key: '', events: [], error: null });
  const [saving, setSaving] = useState(false);
  const mutationPending = useRef(false);

  const [range, setRange] = useState(() => {
    const now = new Date();
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const from = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { from, to };
  });
  const onRangeChange = useCallback((next: { from: string; to: string }) => {
    setRange((current) => current.from === next.from && current.to === next.to ? current : next);
  }, []);

  const requestKey = JSON.stringify([range, filterType, filterSem, revision]);
  const loading = resource.api !== api || resource.key !== requestKey;
  const events = loading ? [] : resource.events;
  const error = loading ? null : resource.error;

  useEffect(() => {
    let cancelled = false;
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (filterType) qs.set('event_type', filterType);
      if (filterSem) qs.set('semester', filterSem);
    api.get<CalendarEvent[]>(`/api/exam-cell/calendar/events?${qs}`).then(
      (data) => { if (!cancelled) setResource({ api, key: requestKey, events: data, error: null }); },
      (cause) => { if (!cancelled) setResource({ api, key: requestKey, events: [], error: cause instanceof Error ? cause.message : 'Failed to load calendar' }); },
    );
    return () => { cancelled = true; };
  }, [api, range, filterType, filterSem, requestKey]);

  async function createEvent() {
    if (!canManage || mutationPending.current) return;
    if (!form.title.trim() || !form.event_date) {
      toast.error('Title and date required');
      return;
    }
    mutationPending.current = true;
    setSaving(true);
    try {
      await api.post('/api/exam-cell/calendar/events', { ...form, title: form.title.trim() });
      toast.success('Calendar event created');
      setForm((f) => ({ ...f, title: '', description: '' }));
      setRevision((value) => value + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      mutationPending.current = false;
      setSaving(false);
    }
  }

  async function reschedule(eventId: string, eventDate: string) {
    if (!canManage || mutationPending.current) return;
    if (!eventId.startsWith('schedule-')) {
      mutationPending.current = true;
      setSaving(true);
      try {
        await api.post(`/api/exam-cell/calendar/events/${eventId}/reschedule`, { event_date: eventDate });
        toast.success('Event rescheduled');
        setRevision((value) => value + 1);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Reschedule failed');
      } finally {
        mutationPending.current = false;
        setSaving(false);
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
          <div className="grid w-full gap-3 sm:grid-cols-2 md:w-auto">
            <div className="space-y-2">
            <label htmlFor="calendar-type-filter" className="text-sm font-medium text-sgvu-navy">Event type</label>
            <Select id="calendar-type-filter" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
            </div>
            <div className="space-y-2">
            <label htmlFor="calendar-semester-filter" className="text-sm font-medium text-sgvu-navy">Semester</label>
            <Select id="calendar-semester-filter" value={filterSem} onChange={(e) => setFilterSem(e.target.value)}>
              <option value="">All semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Sem {s}</option>)}
            </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Add calendar milestone</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <label htmlFor="calendar-milestone-title" className="text-sm font-medium text-sgvu-navy">Milestone title</label>
                <Input id="calendar-milestone-title" placeholder="e.g. Hall ticket release" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label htmlFor="calendar-milestone-type" className="text-sm font-medium text-sgvu-navy">Milestone type</label>
              <Select id="calendar-milestone-type" value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="calendar-milestone-date" className="text-sm font-medium text-sgvu-navy">Milestone date</label>
                <Input id="calendar-milestone-date" type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-center">
              <Button disabled={saving} onClick={() => void createEvent()}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                {saving ? 'Saving event…' : 'Add event'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {loading && <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading calendar…</div>}
          {error && (
            <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>
          )}
          <div hidden={loading || !!error}>
            <ExamCalendar events={filtered} onRangeChange={onRangeChange} onReschedule={(id, d) => void reschedule(id, d)} draggable={canManage && !saving && !loading && !error} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
