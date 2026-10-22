'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useRef, useState } from 'react';
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
const EMPTY_SCHEDULES: Schedule[] = [];
const EMPTY_BLOCKS: Block[] = [];
const EMPTY_FACULTY: Faculty[] = [];

export default function ExamCellResourceAllocationPage() {
  const api = useAuthedApi();
  const [lookupRevision, setLookupRevision] = useState(0);
  const [facultyRevision, setFacultyRevision] = useState(0);
  const [lookups, setLookups] = useState<{ api: typeof api; revision: number; schedules: Schedule[]; blocks: Block[]; error: string | null } | null>(null);
  const [facultyResult, setFacultyResult] = useState<{ api: typeof api; key: string; rows: Faculty[]; error: string | null } | null>(null);
  const currentLookups = lookups?.api === api && lookups.revision === lookupRevision ? lookups : null;
  const lookupLoading = !currentLookups;
  const lookupError = currentLookups?.error;
  const schedules = currentLookups?.schedules ?? EMPTY_SCHEDULES;
  const blocks = currentLookups?.blocks ?? EMPTY_BLOCKS;
  const [examId, setExamId] = useState('');
  const [block, setBlock] = useState('');
  const [room, setRoom] = useState('');
  const [semester, setSemester] = useState('4');
  const [coordinatorId, setCoordinatorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const [allocationResult, setLastResult] = useState<{ api: typeof api; key: string; data: {
    allocated: number;
    room: string;
    subject_name?: string;
  } } | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all([
      api.get<Schedule[]>('/api/exam-cell/schedules'),
      api.get<Block[]>('/api/exam-cell/blocks-halls'),
    ]).then(([scheduleRows, blockRows]) => {
      if (current) setLookups({ api, revision: lookupRevision, schedules: Array.isArray(scheduleRows) ? scheduleRows : [], blocks: Array.isArray(blockRows) ? blockRows : [], error: null });
    }).catch((cause: unknown) => {
      if (current) setLookups({ api, revision: lookupRevision, schedules: [], blocks: [], error: cause instanceof Error ? cause.message : 'Could not load resource lookups' });
    });
    return () => { current = false; };
  }, [api, lookupRevision]);

  const selectedSchedule = schedules.find((s) => s.exam_schedule_id === examId) ?? schedules[0];
  const selectedExamId = selectedSchedule?.exam_schedule_id ?? '';
  const selectedBlock = blocks.some((item) => item.block === block) ? block : blocks[0]?.block ?? '';
  const halls = useMemo(() => blocks.find((b) => b.block === selectedBlock)?.halls ?? [], [blocks, selectedBlock]);
  const selectedRoom = halls.some((hall) => hall.name === room) ? room : halls[0]?.name ?? '';
  const facultyKey = `${lookupRevision}:${selectedExamId}:${String(selectedSchedule?.exam_date ?? '').slice(0, 10)}:${facultyRevision}`;
  const currentFaculty = facultyResult?.api === api && facultyResult.key === facultyKey ? facultyResult : null;
  const facultyLoading = Boolean(selectedSchedule) && !currentFaculty;
  const facultyError = currentFaculty?.error;
  const faculty = currentFaculty?.rows ?? EMPTY_FACULTY;
  const coordinatorInvalid = Boolean(coordinatorId) && !faculty.some((member) => member.user_id === coordinatorId);
  const parametersReady = !lookupLoading && !lookupError && !facultyLoading && !facultyError && !coordinatorInvalid && Boolean(selectedSchedule && selectedRoom);
  const allocationKey = JSON.stringify([selectedExamId, selectedBlock, selectedRoom, semester, coordinatorId]);
  const lastResult = allocationResult?.api === api && allocationResult.key === allocationKey ? allocationResult.data : null;

  useEffect(() => {
    if (!selectedSchedule) return;
    let current = true;
    const dateStr = String(selectedSchedule.exam_date).slice(0, 10);
    void api.get<Faculty[]>(`/api/exam-cell/faculty-roster?date=${dateStr}`).then((data) => {
      if (current) setFacultyResult({ api, key: facultyKey, rows: Array.isArray(data) ? data : [], error: null });
    }).catch((cause: unknown) => {
      if (current) setFacultyResult({ api, key: facultyKey, rows: [], error: cause instanceof Error ? cause.message : 'Could not load faculty roster' });
    });
    return () => { current = false; };
  }, [api, selectedSchedule, facultyKey]);

  async function assignResource() {
    if (submissionPending.current || !parametersReady) return;
    submissionPending.current = true;
    setSubmitting(true);
    try {
      const result = await api.post<{
        allocated: number;
        room: string;
        subject_name?: string;
      }>('/api/exam-cell/seating/assign-resource', {
        exam_schedule_id: selectedExamId,
        room: selectedRoom,
        semester: Number(semester),
        coordinator_faculty_user_id: coordinatorId || undefined,
        block: selectedBlock,
      });
      setLastResult({ api, key: allocationKey, data: result });
      toast.success(`Allocated ${result.allocated} seats in ${result.room}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      submissionPending.current = false;
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

          {lookupLoading && <p role="status" className="text-sm text-muted-foreground">Loading schedules and rooms…</p>}
          {lookupError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>{lookupError}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => setLookupRevision((revision) => revision + 1)}>Retry resource lookups</Button>
          </div>}
          {!lookupLoading && !lookupError && schedules.length === 0 && <p className="text-sm text-muted-foreground">No exam schedules available.</p>}
          {facultyLoading && <p role="status" className="text-sm text-muted-foreground">Loading faculty roster…</p>}
          {facultyError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>{facultyError}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => setFacultyRevision((revision) => revision + 1)}>Retry faculty roster</Button>
          </div>}
          {!facultyLoading && !facultyError && coordinatorInvalid && <p role="alert" className="text-sm text-red-900">The selected coordinator is no longer available. Choose a coordinator or None.</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="resource-exam-schedule" className={labelClass}>Subject / exam schedule</label>
              <Select id="resource-exam-schedule" disabled={submitting || lookupLoading || Boolean(lookupError) || schedules.length === 0} className={fieldClass} value={selectedExamId} onChange={(e) => { setExamId(e.target.value); setCoordinatorId(''); }}>
                {schedules.map((s) => (
                  <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                    {s.subject_name ?? s.subject_code ?? s.exam_type} — {String(s.exam_date).slice(0, 10)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="resource-semester" className={labelClass}>Semester</label>
              <Select id="resource-semester" disabled={submitting} className={fieldClass} value={semester} onChange={(e) => setSemester(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="resource-block" className={labelClass}>Block</label>
              <Select
                id="resource-block"
                disabled={submitting || lookupLoading || Boolean(lookupError) || blocks.length === 0}
                className={fieldClass}
                value={selectedBlock}
                onChange={(e) => {
                  setBlock(e.target.value);
                  const next = blocks.find((b) => b.block === e.target.value);
                  setRoom(next?.halls[0]?.name ?? '');
                }}
              >
                {blocks.map((b) => (
                  <option key={b.block} value={b.block}>{b.block}</option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="resource-room" className={labelClass}>Room / resource</label>
              <Select
                id="resource-room"
                key={`room-${selectedBlock}-${halls.map((h) => h.name).join('|')}`}
                className={fieldClass}
                value={selectedRoom}
                placeholder={lookupLoading ? 'Loading rooms…' : lookupError ? 'Rooms unavailable' : halls.length === 0 ? 'No rooms in this block' : 'Select room'}
                disabled={submitting || lookupLoading || Boolean(lookupError) || halls.length === 0}
                onChange={(e) => setRoom(e.target.value)}
              >
                {halls.length === 0 ? (
                  <option value="">{lookupLoading ? 'Loading rooms…' : lookupError ? 'Rooms unavailable' : 'No rooms in this block'}</option>
                ) : null}
                {halls.map((h) => (
                  <option key={h.name} value={h.name}>
                    {h.name} — capacity {h.capacity}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="resource-coordinator" className={labelClass}>Exam coordinator / invigilator</label>
              <Select
                id="resource-coordinator"
                disabled={submitting || lookupLoading || Boolean(lookupError) || facultyLoading || Boolean(facultyError) || !selectedSchedule}
                className={fieldClass}
                value={coordinatorInvalid ? '' : coordinatorId || 'NONE'}
                onChange={(e) => setCoordinatorId(e.target.value === 'NONE' ? '' : e.target.value)}
              >
                {coordinatorInvalid && <option value="">Choose coordinator</option>}
                <option value="NONE">Optional — none selected</option>
                {faculty.map((f) => (
                  <option key={f.user_id} value={f.user_id}>{f.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <Button className={btnPrimary} disabled={submitting || !parametersReady} onClick={() => void assignResource()}>
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
