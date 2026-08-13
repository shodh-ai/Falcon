'use client';

import { Select } from '@/components/ui/select';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { BookOpen, NotebookPen } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import {
  isEmptyArray,
  isFacultyDemoEntityId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoLogbook } from '@/lib/mock/faculty-portal-demo';

type LogEntry = {
  logbook_id: string;
  class_date: string;
  topic_summary: string;
  course_code: string;
  course_name: string;
};

function formatLogDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FacultyLogbookPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    course_id: '',
    class_date: new Date().toISOString().slice(0, 10),
    topic_summary: '',
  });

  useEffect(() => {
    void api
      .get<LogEntry[]>('/api/academics/faculty/workspaces/logbook')
      .then((rows) =>
        setEntries(withFacultyDemoFallback(rows, facultyDemoLogbook() as LogEntry[], isEmptyArray)),
      )
      .catch(() =>
        setEntries(withFacultyDemoFallback([], facultyDemoLogbook() as LogEntry[], isEmptyArray)),
      );
  }, [api]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isFacultyDemoEntityId(form.course_id)) {
      const course = courses.find((c) => c.course_id === form.course_id);
      setEntries((prev) => [
        {
          logbook_id: `lb-${Date.now()}`,
          class_date: form.class_date || new Date().toISOString().slice(0, 10),
          topic_summary: form.topic_summary,
          course_code: course?.course_code ?? 'DEMO',
          course_name: course?.course_name ?? 'Demo course',
        },
        ...prev,
      ]);
      toast.success('Class logbook entry saved (demo)');
      setForm((f) => ({ ...f, topic_summary: '' }));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/academics/faculty/workspaces/logbook', form);
      toast.success('Class logbook entry saved');
      setEntries(await api.get<LogEntry[]>('/api/academics/faculty/workspaces/logbook'));
      setForm((f) => ({ ...f, topic_summary: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Class Logbook"
        description="After attendance, record what was taught in that lecture."
        meta={
          <>
            <FacultyMetricChip label="Entries" value={entries.length} emphasis />
            <FacultyMetricChip label="Courses" value={courses.length} />
          </>
        }
      />

      <FacultyPanel title="Today's lecture log" description="Log topic coverage for the selected class date">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
            <Select
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              required
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.course_id} value={c.course_id}>{c.course_code}</option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Class date</span>
            <Input
              type="date"
              required
              value={form.class_date}
              onChange={(e) => setForm({ ...form, class_date: e.target.value })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Topic summary</span>
            <Input
              required
              placeholder="e.g. Thermodynamics Ch. 2 — entropy and second law"
              value={form.topic_summary}
              onChange={(e) => setForm({ ...form, topic_summary: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting} className="gap-1.5">
              <NotebookPen className="h-4 w-4" />
              {submitting ? 'Saving…' : 'Save logbook entry'}
            </Button>
          </div>
        </form>
      </FacultyPanel>

      <FacultyPanel title="Recent entries" count={entries.length}>
        {entries.length === 0 ? (
          <FacultyEmptyState description="No logbook entries yet." />
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.logbook_id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                <div>
                  <p className="font-medium text-sgvu-navy">
                    {e.course_code} · {formatLogDate(e.class_date)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.topic_summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </FacultyPanel>
    </FacultyPageShell>
  );
}
