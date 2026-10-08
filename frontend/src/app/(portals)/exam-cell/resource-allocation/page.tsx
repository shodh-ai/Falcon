'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

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
    void api.get<Schedule[]>('/api/exam-cell/schedules').then((data) => {
      const rows = Array.isArray(data) ? data : [];
      setSchedules(rows);
      if (rows[0]) setExamId(rows[0].exam_schedule_id);
    });
    void api.get<Block[]>('/api/exam-cell/blocks-halls').then((data) => {
      const rows = Array.isArray(data) ? data : [];
      setBlocks(rows);
      if (rows[0]) {
        setBlock(rows[0].block);
        if (rows[0].halls?.[0]?.name) setRoom(rows[0].halls[0].name);
      }
    });
  }, [api]);

  const selectedSchedule = schedules.find((s) => s.exam_schedule_id === examId);
  const halls = useMemo(() => blocks.find((b) => b.block === block)?.halls ?? [], [blocks, block]);

  // Keep room in sync with the halls list for the selected block (Radix Select goes blank if value is missing from options).
  useEffect(() => {
    if (halls.length === 0) {
      if (room) setRoom('');
      return;
    }
    if (!halls.some((h) => h.name === room)) {
      setRoom(halls[0].name);
    }
  }, [halls, room]);

  useEffect(() => {
    if (!selectedSchedule) return;
    const dateStr = String(selectedSchedule.exam_date).slice(0, 10);
    void api.get<Faculty[]>(`/api/exam-cell/faculty-roster?date=${dateStr}`).then((data) => {
      setFaculty(Array.isArray(data) ? data : []);
    });
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

  const fieldClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
  const btnPrimary =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="resource-allocation" />
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="border-b border-sgvu-navy/10 pb-4">
            <h2 className="text-lg font-bold text-sgvu-navy">Assign students to room</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Select schedule, room, and optional coordinator, then publish the seating plan.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className={labelClass}>Subject / exam schedule</label>
              <Select className={fieldClass} value={examId} onChange={(e) => setExamId(e.target.value)}>
                {schedules.map((s) => (
                  <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                    {s.subject_name ?? s.subject_code ?? s.exam_type} — {String(s.exam_date).slice(0, 10)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Semester</label>
              <Select className={fieldClass} value={semester} onChange={(e) => setSemester(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Block</label>
              <Select
                className={fieldClass}
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
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Room / resource</label>
              <Select
                key={`room-${block}-${halls.map((h) => h.name).join('|')}`}
                className={fieldClass}
                value={halls.some((h) => h.name === room) ? room : undefined}
                placeholder={halls.length === 0 ? 'No rooms in this block' : 'Select room'}
                disabled={halls.length === 0}
                onChange={(e) => setRoom(e.target.value)}
              >
                {halls.length === 0 ? (
                  <option value="">No rooms in this block</option>
                ) : null}
                {halls.map((h) => (
                  <option key={h.name} value={h.name}>
                    {h.name} — capacity {h.capacity}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Exam coordinator / invigilator</label>
              <Select
                className={fieldClass}
                value={coordinatorId || 'NONE'}
                onChange={(e) => setCoordinatorId(e.target.value === 'NONE' ? '' : e.target.value)}
              >
                <option value="NONE">Optional — none selected</option>
                {faculty.map((f) => (
                  <option key={f.user_id} value={f.user_id}>{f.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <Button className={btnPrimary} disabled={submitting} onClick={() => void assignResource()}>
              {submitting ? 'Allocating…' : 'Assign roll seats & publish plan'}
            </Button>
          </div>

          {lastResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-semibold">{lastResult.subject_name}</span>
              : {lastResult.allocated} students seated in {lastResult.room}. Student seating view updated.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
