'use client';

import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useEffect } from 'react';

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type TimetableRow = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
};

type Adjustment = {
  adjustment_id: string;
  adjustment_type: string;
  status: string;
  course_code: string;
  course_name: string;
  original_date: string | null;
  new_date: string | null;
  reason: string | null;
};

export default function FacultyTimetablePage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [schedule, setSchedule] = useState<TimetableRow[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    adjustment_type: 'EXTRA_CLASS',
    new_date: '',
    reason: '',
  });

  useEffect(() => {
    void api.get<TimetableRow[]>('/api/academics/faculty/workspaces/timetable').then(setSchedule);
    void api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments').then(setAdjustments);
  }, [api]);

  async function submitAdjustment(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/academics/faculty/workspaces/adjustments', form);
      toast.success('Request sent to HoD for approval. Students will be notified after approval.');
      setAdjustments(await api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Timetable & Extra Classes"
        description="Weekly L-T-P schedule. Request extra classes, cancellations, or substitutions (HoD approval + student alerts)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {schedule.map((s) => (
            <div key={s.timetable_id} className="rounded-xl border p-3 text-sm">
              <p className="font-semibold text-sgvu-navy">
                {DAYS[s.day_of_week]} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
              </p>
              <p>
                {s.course_code} — {s.course_name}
              </p>
              <p className="text-muted-foreground">Room {s.room ?? 'TBA'}</p>
            </div>
          ))}
          {schedule.length === 0 ? <p className="text-sm text-muted-foreground">No timetable rows assigned yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule extra / cancel / substitute</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submitAdjustment}>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
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
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={form.adjustment_type}
              onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}
            >
              <option value="EXTRA_CLASS">Extra class</option>
              <option value="CANCEL">Cancel class</option>
              <option value="SUBSTITUTE">Substitute</option>
            </select>
            <Input
              type="datetime-local"
              value={form.new_date}
              onChange={(e) => setForm({ ...form, new_date: e.target.value })}
            />
            <Input
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <Button type="submit" className="md:col-span-2">
              Submit for HoD approval
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {adjustments.map((a) => (
            <div key={a.adjustment_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>
                {a.course_code} — {a.adjustment_type.replace('_', ' ')}
              </span>
              <Badge variant="outline">{a.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
