'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function ExamCellSchedulePage() {
  const api = useAuthedApi();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [form, setForm] = useState({
    exam_type: 'END_TERM',
    subject_id: '1',
    exam_date: '',
    start_time: '09:00',
    end_time: '12:00',
    venue: 'Block A Hall 1',
    max_marks: '100',
    batch_label: 'B.Tech Sem 4',
  });

  const load = useCallback(() => {
    void api.get<Schedule[]>('/api/exam-cell/schedules').then(setSchedules);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    try {
      await api.post('/api/exam-cell/schedules', {
        ...form,
        subject_id: Number(form.subject_id),
        max_marks: Number(form.max_marks),
      });
      toast.success('Exam scheduled');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Master Exam Schedule</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add exam slot</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(['exam_type', 'subject_id', 'exam_date', 'start_time', 'end_time', 'venue', 'max_marks', 'batch_label'] as const).map((k) => (
            <Input
              key={k}
              placeholder={k.replace(/_/g, ' ')}
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            />
          ))}
          <Button className="sm:col-span-2" onClick={() => void create()}>Add to schedule</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {schedules.map((s) => (
          <div key={s.exam_schedule_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-sm">
            <div>
              <p className="font-semibold text-sgvu-navy">{s.subject_name ?? s.subject_code ?? 'Subject'} · {s.exam_type}</p>
              <p className="text-muted-foreground">
                {String(s.exam_date).slice(0, 10)} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)} · {s.venue}
              </p>
            </div>
            <Badge>{s.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
