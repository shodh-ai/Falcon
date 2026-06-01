'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type LogEntry = {
  logbook_id: string;
  class_date: string;
  topic_summary: string;
  course_code: string;
  course_name: string;
};

export default function FacultyLogbookPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    class_date: new Date().toISOString().slice(0, 10),
    topic_summary: '',
  });

  useEffect(() => {
    void api.get<LogEntry[]>('/api/academics/faculty/workspaces/logbook').then(setEntries);
  }, [api]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/academics/faculty/workspaces/logbook', form);
      toast.success('Class logbook entry saved');
      setEntries(await api.get<LogEntry[]>('/api/academics/faculty/workspaces/logbook'));
      setForm((f) => ({ ...f, topic_summary: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Digital Class Logbook"
        description="After attendance, record what was taught in that lecture (mandated by many universities)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s lecture log</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onSubmit}>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              required
            >
              <option value="">Course</option>
              {courses.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code}
                </option>
              ))}
            </select>
            <Input type="date" value={form.class_date} onChange={(e) => setForm({ ...form, class_date: e.target.value })} />
            <Input
              required
              placeholder='e.g. "Covered Thermodynamics Chapter 2 — entropy and second law"'
              value={form.topic_summary}
              onChange={(e) => setForm({ ...form, topic_summary: e.target.value })}
            />
            <Button type="submit">Save logbook entry</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {entries.map((e) => (
            <div key={e.logbook_id} className="rounded-lg border px-3 py-2">
              <p className="font-medium">
                {e.course_code} · {e.class_date}
              </p>
              <p className="text-muted-foreground">{e.topic_summary}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
