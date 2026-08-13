'use client';

import { Select } from '@/components/ui/select';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { isFacultyDemoSmokeId } from '@/lib/faculty-demo-mode';

type Lecture = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  lecture_date: string;
  start_time: string;
  end_time: string;
};

type Colleague = { user_id: string; name: string; email: string };

export function ProxyTeachingDialog({
  startDate,
  endDate,
  onDone,
}: {
  startDate: string;
  endDate: string;
  onDone?: () => void;
}) {
  const api = useAuthedApi();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [lec, col] = await Promise.all([
          api.get<Lecture[]>(
            `/api/academics/faculty/proxy/lectures?start_date=${startDate}&end_date=${endDate}`,
          ),
          api.get<Colleague[]>('/api/academics/faculty/proxy/colleagues'),
        ]);
        setLectures(lec);
        setColleagues(col);
      } catch {
        setLectures([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, startDate, endDate]);

  if (loading) return <p className="text-sm text-muted-foreground">Checking scheduled lectures…</p>;
  if (!lectures.length) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const selected = lectures.filter(
      (lec) => selections[`${lec.timetable_id}-${lec.lecture_date}`],
    );
    if (!selected.length) {
      toast.error('Select at least one proxy faculty for a lecture before submitting.');
      return;
    }
    if (selected.some((lec) => isFacultyDemoSmokeId(lec.timetable_id))) {
      toast.success('Alternate teaching arrangements submitted for HOD approval (demo)');
      onDone?.();
      return;
    }
    setSaving(true);
    try {
      for (const lec of selected) {
        const proxyId = selections[`${lec.timetable_id}-${lec.lecture_date}`];
        await api.post('/api/academics/faculty/proxy-requests', {
          timetable_id: lec.timetable_id,
          proxy_faculty_id: proxyId,
          date_of_proxy: lec.lecture_date,
          reason: 'Leave — alternate teaching arrangement',
        });
      }
      toast.success('Alternate teaching arrangements submitted for HOD approval');
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit proxy requests');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
      <p className="text-sm font-bold text-sgvu-navy">
        You have {lectures.length} lecture{lectures.length === 1 ? '' : 's'} during leave. Propose Alternate Teaching
        Arrangement.
      </p>
      {lectures.map((lec) => {
        const key = `${lec.timetable_id}-${lec.lecture_date}`;
        return (
          <div key={key} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="text-sm">
              <span className="font-semibold">{lec.course_code}</span> · {lec.lecture_date} ·{' '}
              {String(lec.start_time).slice(0, 5)}
            </div>
            <Select
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={selections[key] ?? ''}
              onChange={(e) => setSelections((s) => ({ ...s, [key]: e.target.value }))}
            >
              <option value="">Select proxy faculty</option>
              {colleagues.map((c) => (
                <option key={c.user_id} value={c.user_id}>{c.name}</option>
              ))}
            </Select>
          </div>
        );
      })}
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? 'Submitting…' : 'Submit proxy proposals'}
      </Button>
    </form>
  );
}
