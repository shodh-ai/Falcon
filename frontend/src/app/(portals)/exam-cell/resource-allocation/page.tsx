'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Schedule = {
  exam_schedule_id: string;
  exam_type: string;
  exam_date: string;
  subject_name?: string;
  subject_code?: string;
};
type Block = { block: string; halls: { name: string; capacity: number }[] };
type Faculty = { user_id: string; name: string };

export default function ExamCellResourceAllocationPage() {
  const api = useAuthedApi();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [examId, setExamId] = useState('');
  const [block, setBlock] = useState('');
  const [room, setRoom] = useState('');
  const [semester, setSemester] = useState('4');
  const [coordinatorId, setCoordinatorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    allocated: number;
    room: string;
    subject_name?: string;
  } | null>(null);

  useEffect(() => {
    void api.get<Schedule[]>('/api/exam-cell/schedules').then((rows) => {
      setSchedules(rows);
      if (rows[0]) setExamId(rows[0].exam_schedule_id);
    });
    void api.get<Block[]>('/api/exam-cell/blocks-halls').then((rows) => {
      setBlocks(rows);
      if (rows[0]) {
        setBlock(rows[0].block);
        if (rows[0].halls[0]) setRoom(rows[0].halls[0].name);
      }
    });
  }, [api]);

  const selectedSchedule = schedules.find((s) => s.exam_schedule_id === examId);
  const halls = useMemo(() => blocks.find((b) => b.block === block)?.halls ?? [], [blocks, block]);

  useEffect(() => {
    if (!selectedSchedule) return;
    const dateStr = String(selectedSchedule.exam_date).slice(0, 10);
    void api.get<Faculty[]>(`/api/exam-cell/faculty-roster?date=${dateStr}`).then(setFaculty);
  }, [api, selectedSchedule]);

  async function assignResource() {
    if (!examId || !room) {
      toast.error('Select subject schedule and room');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{
        allocated: number;
        room: string;
        subject_name?: string;
      }>('/api/exam-cell/seating/assign-resource', {
        exam_schedule_id: examId,
        room,
        semester: Number(semester),
        coordinator_faculty_user_id: coordinatorId || undefined,
        block,
      });
      setLastResult(result);
      toast.success(`Allocated ${result.allocated} seats in ${result.room}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-sgvu-navy">Exam resource allocation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a subject exam, assign a room, auto-seat students by roll order up to room capacity,
          and designate an exam coordinator / invigilator.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign students to room</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Subject / exam schedule</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
            >
              {schedules.map((s) => (
                <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                  {s.subject_name ?? s.subject_code ?? s.exam_type} — {s.exam_date}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Semester</span>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Block</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={block}
              onChange={(e) => {
                setBlock(e.target.value);
                const next = blocks.find((b) => b.block === e.target.value);
                if (next?.halls[0]) setRoom(next.halls[0].name);
              }}
            >
              {blocks.map((b) => (
                <option key={b.block} value={b.block}>{b.block}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Room / resource</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            >
              {halls.map((h) => (
                <option key={h.name} value={h.name}>
                  {h.name} — capacity {h.capacity}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Exam coordinator / invigilator</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={coordinatorId}
              onChange={(e) => setCoordinatorId(e.target.value)}
            >
              <option value="">— Optional —</option>
              {faculty.map((f) => (
                <option key={f.user_id} value={f.user_id}>{f.name}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Button disabled={submitting} onClick={() => void assignResource()}>
              {submitting ? 'Allocating…' : 'Assign roll seats & publish plan'}
            </Button>
          </div>
          {lastResult && (
            <p className="text-sm text-emerald-700 sm:col-span-2">
              {lastResult.subject_name}: {lastResult.allocated} students seated in {lastResult.room}.
              Student seating view updated.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
