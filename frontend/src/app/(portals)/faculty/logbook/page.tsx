'use client';

import { Select } from '@/components/ui/select';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { BookOpen, NotebookPen } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
  FacultyErrorBanner,
  FacultyInlineLoading,
} from '@/components/faculty';
import { uniqueFacultyCoursesByCourseId, useFacultyCourses } from '@/components/faculty/useFacultyCourses';
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
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function localClassDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isValidClassDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function FacultyLogbookPage() {
  const api = useAuthedApi();
  const { courses, loading: coursesLoading, error: coursesError } = useFacultyCourses();
  const courseOptions = uniqueFacultyCoursesByCourseId(courses);
  const courseLoadError = coursesError && coursesError !== 'No courses allocated to your timetable yet.'
    ? coursesError
    : null;
  const coursesUnavailable = coursesLoading || Boolean(courseLoadError) || courseOptions.length === 0;
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loadId = useRef(0);
  const saving = useRef(false);
  const mounted = useRef(false);
  const [form, setForm] = useState({
    course_id: '',
    class_date: '',
    topic_summary: '',
  });
  const selectedCourse = courseOptions.find((course) => course.course_id === form.course_id);
  const canSave = !coursesUnavailable && Boolean(selectedCourse) && isValidClassDate(form.class_date) && form.topic_summary.trim().length > 0;

  const loadEntries = useCallback(async (afterSave = false) => {
    const requestId = ++loadId.current;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const rows = await api.get<LogEntry[]>('/api/academics/faculty/workspaces/logbook');
      if (requestId !== loadId.current) return;
      setEntries(withFacultyDemoFallback(rows, facultyDemoLogbook() as LogEntry[], isEmptyArray));
    } catch (error) {
      if (requestId !== loadId.current) return;
      const fallback = withFacultyDemoFallback([], facultyDemoLogbook() as LogEntry[], isEmptyArray);
      setEntries(fallback);
      if (fallback.length === 0) {
        const message = error instanceof Error ? error.message : 'Could not load logbook entries';
        setEntriesError(afterSave ? `Entry saved, but the recent entries could not be refreshed. ${message}` : message);
      }
    } finally {
      if (requestId === loadId.current) setEntriesLoading(false);
    }
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    // Initialize the browser's local calendar date after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((current) => ({ ...current, class_date: current.class_date || localClassDate() }));
    void loadEntries();
    return () => {
      mounted.current = false;
      loadId.current += 1;
    };
  }, [loadEntries]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving.current || !canSave || !selectedCourse) return;
    const payload = { ...form, topic_summary: form.topic_summary.trim() };
    saving.current = true;
    setSubmitting(true);
    setSaveError(null);
    try {
      if (isFacultyDemoEntityId(payload.course_id)) {
        loadId.current += 1;
        setEntriesLoading(false);
        setEntries((prev) => [
          {
            logbook_id: `lb-${Date.now()}`,
            class_date: payload.class_date,
            topic_summary: payload.topic_summary,
            course_code: selectedCourse.course_code,
            course_name: selectedCourse.course_name,
          },
          ...prev.filter((entry) => entry.course_code !== selectedCourse.course_code || entry.class_date.slice(0, 10) !== payload.class_date),
        ]);
        setEntriesError(null);
        setForm((current) => ({ ...current, topic_summary: '' }));
        toast.success('Class logbook entry saved (demo)');
        return;
      }
      await api.post('/api/academics/faculty/workspaces/logbook', payload);
      if (!mounted.current) return;
      toast.success('Class logbook entry saved');
      setForm((current) => ({ ...current, topic_summary: '' }));
      await loadEntries(true);
    } catch (err) {
      if (!mounted.current) return;
      const message = err instanceof Error ? err.message : 'Failed to save';
      setSaveError(message);
      toast.error(message);
    } finally {
      saving.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Class Logbook"
        description="After attendance, record what was taught in that lecture."
        meta={
          <>
            {!entriesLoading && !entriesError ? <FacultyMetricChip label="Entries" value={entries.length} emphasis /> : null}
            {!coursesUnavailable ? <FacultyMetricChip label="Courses" value={courseOptions.length} /> : null}
          </>
        }
      />

      <FacultyPanel title="Lecture log" description="One entry per course and date. Saving again updates the existing topic.">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <label htmlFor="logbook-course" className="text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
            <Select
              id="logbook-course"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={!coursesUnavailable && selectedCourse ? form.course_id : ''}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              required
              disabled={coursesUnavailable || submitting}
            >
              <option value="">
                {coursesLoading ? 'Loading courses…' : courseLoadError ? 'Unable to load courses' : courseOptions.length === 0 ? 'No courses assigned' : 'Select course'}
              </option>
              {courseOptions.map((c) => (
                <option key={c.course_id} value={c.course_id}>{c.course_code} — {c.course_name}</option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Class date</span>
            <Input
              type="date"
              required
              disabled={submitting}
              value={form.class_date}
              onChange={(e) => setForm({ ...form, class_date: e.target.value })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium text-sgvu-navy">Topic summary</span>
            <Input
              required
              disabled={submitting}
              placeholder="e.g. Thermodynamics Ch. 2 — entropy and second law"
              value={form.topic_summary}
              onChange={(e) => setForm({ ...form, topic_summary: e.target.value })}
            />
          </label>
          {!coursesLoading && courseLoadError ? (
            <div className="sm:col-span-2" role="alert">
              <FacultyErrorBanner message={`${courseLoadError} Refresh the page to try again.`} />
            </div>
          ) : !coursesLoading && courseOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
              No teaching courses are assigned yet. Contact your HOD if you expected a teaching assignment.
            </p>
          ) : null}
          {saveError ? (
            <div className="sm:col-span-2" role="alert"><FacultyErrorBanner message={saveError} /></div>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting || !canSave} className="gap-1.5">
              <NotebookPen className="h-4 w-4" />
              {submitting ? 'Saving…' : 'Save logbook entry'}
            </Button>
          </div>
        </form>
      </FacultyPanel>

      <FacultyPanel title="Recent entries" count={entriesLoading || entriesError ? undefined : entries.length}>
        {entriesLoading ? (
          <FacultyInlineLoading label="Loading logbook entries…" />
        ) : entriesError ? (
          <div className="space-y-3">
            <div role="alert"><FacultyErrorBanner message={entriesError} /></div>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => void loadEntries()}>Retry</Button>
          </div>
        ) : entries.length === 0 ? (
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
