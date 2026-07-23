'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Schedule = {
  exam_schedule_id: string;
  exam_type: string;
  subject_name?: string;
  subject_code?: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  venue: string;
  max_marks: number;
  status: string;
  batch_label?: string;
};

type Subject = { subject_id: number; subject_code: string; subject_name: string; semester: number };

export default function ExamCellSchedulePage() {
  const api = useAuthedApi();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    exam_type: 'END_TERM',
    subject_id: '',
    exam_date: '',
    start_time: '09:00',
    end_time: '12:00',
    venue: 'Block A Hall 1',
    max_marks: '100',
    batch_label: 'B.Tech Sem 4',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleRows, subjectRows] = await Promise.all([
        api.get<Schedule[]>('/api/exam-cell/schedules'),
        api.get<Subject[]>('/api/exam-cell/subjects'),
      ]);
      setSchedules(scheduleRows);
      setSubjects(subjectRows);
      setForm((f) =>
        f.subject_id || subjectRows.length === 0
          ? f
          : { ...f, subject_id: String(subjectRows[0].subject_id) },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load schedules');
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!form.exam_date || !form.subject_id) {
      toast.error('Select a subject and exam date');
      return;
    }
    try {
      await api.post('/api/exam-cell/schedules', {
        ...form,
        subject_id: Number(form.subject_id),
        max_marks: Number(form.max_marks),
      });
      toast.success('Exam scheduled — enrolled students notified via in-app alert');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">Master Exam Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Central timetable for admit cards, seating, and invigilation. Students receive an in-app
            notification when a new slot is added.
          </p>
        </CardContent>
      </Card>

      <Card className="border-sgvu-gold/20 bg-amber-50/30">
        <CardContent className="py-3 text-sm">
          When you add an exam slot, Falcon notifies all students enrolled in that subject&apos;s semester on their Student Portal (Notifications → Exams).
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add exam slot</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-h-[4.5rem] flex-col gap-1.5">
            <label className="text-sm font-bold leading-5 text-sgvu-navy">Exam type</label>
            <Select className="h-10 w-full rounded-md border px-3 text-sm" value={form.exam_type} onChange={(e) => setForm((f) => ({ ...f, exam_type: e.target.value }))}>
              <option value="MID_TERM">Mid Term</option>
              <option value="END_TERM">End Term</option>
              <option value="PRACTICAL">Practical</option>
            </Select>
          </div>
          <div className="flex min-h-[4.5rem] flex-col gap-1.5">
            <label className="text-sm font-bold leading-5 text-sgvu-navy">Subject</label>
            <Select className="h-10 w-full rounded-md border px-3 text-sm" value={form.subject_id} onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}>
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.subject_id} value={s.subject_id}>
                  {s.subject_code} — {s.subject_name} (Sem {s.semester})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-h-[4.5rem] flex-col gap-1.5">
            <label className="text-sm font-bold leading-5 text-sgvu-navy">Exam date</label>
            <Input type="date" className="h-10" value={form.exam_date} onChange={(e) => setForm((f) => ({ ...f, exam_date: e.target.value }))} />
          </div>
          <div className="flex min-h-[4.5rem] flex-col gap-1.5">
            <label className="text-sm font-bold leading-5 text-sgvu-navy">Batch label</label>
            <Input className="h-10" value={form.batch_label} onChange={(e) => setForm((f) => ({ ...f, batch_label: e.target.value }))} />
          </div>
          <Input type="time" className="h-10" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
          <Input type="time" className="h-10" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
          <Input className="h-10" placeholder="Venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} />
          <Input className="h-10" placeholder="Max marks" value={form.max_marks} onChange={(e) => setForm((f) => ({ ...f, max_marks: e.target.value }))} />
          <Button className="sm:col-span-2" onClick={() => void create()}>Add to schedule</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{schedules.length} scheduled exams</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
            </div>
          ) : schedules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No exams scheduled yet. Add a slot above or run database smoke seeds.</p>
          ) : (
            schedules.map((s) => (
              <div key={s.exam_schedule_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-sgvu-navy">{s.subject_name ?? s.subject_code ?? 'Subject'} · {s.exam_type}</p>
                  <p className="text-muted-foreground">
                    {String(s.exam_date).slice(0, 10)} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)} · {s.venue}
                    {s.batch_label ? ` · ${s.batch_label}` : ''}
                  </p>
                </div>
                <Badge>{s.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
