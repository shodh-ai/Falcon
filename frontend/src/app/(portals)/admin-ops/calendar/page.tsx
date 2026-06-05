'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi } from '@/lib/api/api.campus-events';

export default function AdminOpsMasterCalendarPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const [rows, setRows] = useState<
    { calendar_id: string; date: string; title: string; description?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: '', title: '', description: '' });

  const load = useCallback(async () => {
    const data = await eventsApi.masterCalendar('2025-26');
    setRows(data);
  }, [eventsApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load master calendar'))
      .finally(() => setLoading(false));
  }, [load]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.title) return;
    try {
      await eventsApi.upsertCalendar({
        date: form.date,
        title: form.title,
        description: form.description || undefined,
        academic_year: '2025-26',
        is_blocked_for_events: true,
      });
      toast.success('Blocked date saved');
      setForm({ date: '', title: '', description: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/api/campus-events/master-calendar/${id}`);
      await load();
    } catch {
      toast.error('Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-sgvu-navy">
          <Calendar className="h-7 w-7" />
          Master Academic Calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          Block exam days, holidays, and convocation so clubs cannot propose events on those dates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            Add blocked date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(ev) => void addEntry(ev)}>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            <Input placeholder="Title (e.g. Mid-Term Exams)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            <Input className="md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <Button type="submit" className="md:col-span-2 bg-sgvu-navy">
              Block date for club events
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked dates ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((r) => (
            <div key={r.calendar_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-muted-foreground">{new Date(r.date).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Blocked</Badge>
                <Button size="icon" variant="ghost" onClick={() => void remove(r.calendar_id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
