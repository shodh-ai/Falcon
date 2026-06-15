'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Schedule = { exam_schedule_id: string; exam_type: string; exam_date: string; venue: string };

export default function ExamCellSeatingPage() {
  const api = useAuthedApi();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [examId, setExamId] = useState('');
  const [semester, setSemester] = useState('4');
  const [rooms, setRooms] = useState('Hall A, Hall B, Hall C, Hall D, Hall E, Hall F, Hall G, Hall H, Hall I, Hall J');
  const [allocations, setAllocations] = useState<unknown[]>([]);

  useEffect(() => {
    void api.get<Schedule[]>('/api/exam-cell/schedules').then((s) => {
      setSchedules(s);
      if (s[0]) setExamId(s[0].exam_schedule_id);
    });
  }, [api]);

  const loadAlloc = useCallback(() => {
    if (!examId) return;
    void api.get<unknown[]>(`/api/exam-cell/seating-allocations?exam_schedule_id=${examId}`).then(setAllocations);
  }, [api, examId]);

  useEffect(() => {
    loadAlloc();
  }, [loadAlloc]);

  async function allocate() {
    try {
      const res = await api.post<{ allocated: number }>('/api/exam-cell/seating/auto-allocate', {
        exam_schedule_id: examId,
        semester: Number(semester),
        rooms: rooms.split(',').map((r) => r.trim()).filter(Boolean),
      });
      toast.success(`Allocated ${res.allocated} seats across rooms`);
      loadAlloc();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Seating Planner</h1>
        <p className="text-sm text-muted-foreground">Auto-allocate ensures adjacent seats are not the same branch.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Auto-allocate seats</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {schedules.map((s) => (
              <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                {s.exam_type} · {String(s.exam_date).slice(0, 10)} · {s.venue}
              </option>
            ))}
          </select>
          <Input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Semester" />
          <Input value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="Comma-separated room names" />
          <Button onClick={() => void allocate()}>Auto-allocate seats</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{allocations.length} seat assignments</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-y-auto text-sm">
          {(allocations as { room: string; seat_number: string; student_name: string; branch_code: string }[]).map((a, i) => (
            <div key={i} className="flex justify-between border-b py-1.5">
              <span>{a.student_name}</span>
              <span className="text-muted-foreground">{a.room} · Seat {a.seat_number} · {a.branch_code}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
