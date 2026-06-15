'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Duty = {
  duty_id: string;
  faculty_name: string;
  room: string;
  exam_type: string;
  exam_date: string;
  start_time: string;
  published: boolean;
  status: string;
};

type Faculty = { user_id: string; name: string };
type Schedule = { exam_schedule_id: string; exam_type: string; exam_date: string };

export default function ExamCellInvigilationPage() {
  const api = useAuthedApi();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [examId, setExamId] = useState('');
  const [room, setRoom] = useState('Hall A');
  const [facultyId, setFacultyId] = useState('');

  const load = useCallback(() => {
    void api.get<Duty[]>('/api/exam-cell/invigilation').then(setDuties);
  }, [api]);

  useEffect(() => {
    load();
    void api.get<Faculty[]>('/api/exam-cell/faculty-roster').then(setFaculty);
    void api.get<Schedule[]>('/api/exam-cell/schedules').then((s) => {
      setSchedules(s);
      if (s[0]) setExamId(s[0].exam_schedule_id);
    });
  }, [api, load]);

  async function assign() {
    try {
      await api.post('/api/exam-cell/invigilation/assign', {
        exam_schedule_id: examId,
        room,
        faculty_user_id: facultyId,
      });
      toast.success('Faculty assigned');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed');
    }
  }

  async function publish() {
    try {
      const res = await api.post<{ published: number }>('/api/exam-cell/invigilation/publish', { exam_schedule_id: examId });
      toast.success(`Published ${res.published} duties to Faculty Portal`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Invigilation Roster</h1>
        <p className="text-sm text-muted-foreground">Assignments sync instantly to Faculty → Exam Invigilation Duty.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assign faculty to room</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <select className="rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {schedules.map((s) => (
              <option key={s.exam_schedule_id} value={s.exam_schedule_id}>{s.exam_type} · {String(s.exam_date).slice(0, 10)}</option>
            ))}
          </select>
          <input className="rounded-md border px-3 py-2 text-sm" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" />
          <select className="rounded-md border px-3 py-2 text-sm sm:col-span-2" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
            <option value="">Select faculty</option>
            {faculty.map((f) => (
              <option key={f.user_id} value={f.user_id}>{f.name}</option>
            ))}
          </select>
          <Button onClick={() => void assign()}>Assign</Button>
          <Button variant="secondary" onClick={() => void publish()}>Publish roster to faculty</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {duties.map((d) => (
          <div key={d.duty_id} className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
            <div>
              <p className="font-semibold">{d.faculty_name} · {d.room}</p>
              <p className="text-muted-foreground">{d.exam_type} · {String(d.exam_date).slice(0, 10)}</p>
            </div>
            <Badge variant={d.published ? 'default' : 'secondary'}>{d.published ? 'Published' : d.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
