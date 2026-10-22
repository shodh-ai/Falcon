'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Schedule = { exam_schedule_id: string; exam_type: string; exam_date: string; venue: string; subject_name?: string; subject_code?: string };
type Hall = { name: string; capacity: number; rows: number; cols: number };
type Block = { block: string; halls: Hall[] };
type SeatingAllocation = {
  student_name: string;
  student_user_id: string;
  branch_code: string;
  subject_name?: string | null;
  exam_date?: string | null;
  room: string;
  seat_number: string;
};
type SeatingRun = {
  run_id: string;
  allocation_strategy: string;
  exam_type?: string | null;
  exam_schedule_id?: string | null;
  semester: number;
  branch: string;
  created_at: string;
  total_allocated: number;
  allocations: SeatingAllocation[];
  subject_name?: string | null;
  exam_date?: string | null;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

const BRANCH_BADGE_STYLES = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-amber-100 text-amber-800 border-amber-200',
];

const BRANCH_BAR_STYLES = [
  'bg-blue-500',
  'bg-orange-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-amber-500',
];

function branchStyle(branch: string, indexMap: Map<string, number>) {
  if (!indexMap.has(branch)) {
    indexMap.set(branch, indexMap.size % BRANCH_BADGE_STYLES.length);
  }
  const idx = indexMap.get(branch)!;
  return { badge: BRANCH_BADGE_STYLES[idx], bar: BRANCH_BAR_STYLES[idx] };
}

export default function ExamCellSeatingPage() {
  const api = useAuthedApi();
  const [strategy, setStrategy] = useState<'by_exam_type' | 'by_schedule'>('by_exam_type');
  
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [blocksData, setBlocksData] = useState<Block[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  
  const [examType, setExamType] = useState('MID_TERM');
  const [examId, setExamId] = useState('');
  const [semester, setSemester] = useState('4');
  const [branch, setBranch] = useState('All Branches');
  
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selectedHalls, setSelectedHalls] = useState<string[]>([]);
  
  const [runs, setRuns] = useState<SeatingRun[]>([]);
  const [viewingRun, setViewingRun] = useState<SeatingRun | null>(null);
  const [visualAllocations, setVisualAllocations] = useState<SeatingAllocation[]>([]);
  const [showVisualRooms, setShowVisualRooms] = useState(false);
  const [swapRoom, setSwapRoom] = useState<string | null>(null);
  const [swapA, setSwapA] = useState('');
  const [swapB, setSwapB] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRetry, setLoadRetry] = useState(0);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchesRetry, setBranchesRetry] = useState(0);
  const [busyAction, setBusyAction] = useState<'allocate' | 'publish' | 'swap' | 'delete' | null>(null);
  const pendingAction = useRef(false);
  const runsGeneration = useRef(0);
  const [visualContext, setVisualContext] = useState('');
  const [visualScheduleId, setVisualScheduleId] = useState<string | null>(null);
  const [visualRunId, setVisualRunId] = useState<string | null>(null);
  const contextKey = JSON.stringify([strategy, examType, examId, semester, branch]);
  const visualCurrent = visualContext === contextKey;
  const parametersReady = !loading && !loadError && !branchesLoading && !branchesError;

  async function publishPlans() {
    if (pendingAction.current || !parametersReady) return;
    if (strategy !== 'by_schedule' || !examId) {
      toast.error('Choose Specific schedule and select the schedule to publish');
      return;
    }
    pendingAction.current = true;
    setBusyAction('publish');
    try {
      const res = await api.post<{ published_rooms: number }>('/api/exam-cell/seating/publish-plans', {
        exam_schedule_id: examId,
      });
      toast.success(`Published ${res.published_rooms} room plan(s) to student portal`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      pendingAction.current = false;
      setBusyAction(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setLoadError(null);
      try {
        const [scheduleRows, blockRows] = await Promise.all([
          api.get<Schedule[]>('/api/exam-cell/schedules'),
          api.get<Block[]>('/api/exam-cell/blocks-halls'),
        ]);
        if (cancelled) return;

        const nextSchedules = asArray<Schedule>(scheduleRows);
        const nextBlocks = asArray<Block>(blockRows);
        setSchedules(nextSchedules);
        setBlocksData(nextBlocks);
        setExamId((current) => nextSchedules.some((row) => row.exam_schedule_id === current) ? current : '');
        if (nextBlocks[0]?.block) setSelectedBlock(nextBlocks[0].block);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Could not load seating planner data');
          setLoadError(err instanceof Error ? err.message : 'Could not load seating planner data');
          setSchedules([]);
          setBlocksData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    queueMicrotask(() => { if (!cancelled) void loadInitial(); });
    return () => {
      cancelled = true;
    };
  }, [api, loadRetry]);

  useEffect(() => {
    if (!semester) return;
    let cancelled = false;

    async function loadBranches() {
      setBranchesLoading(true);
      setBranchesError(null);
      try {
        const rows = await api.get<string[]>(`/api/exam-cell/branches?semester=${semester}`);
        if (!cancelled) setBranches(asArray<string>(rows));
      } catch (error) {
        if (!cancelled) {
          setBranches([]);
          setBranchesError(error instanceof Error ? error.message : 'Could not load branches');
        }
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    }

    queueMicrotask(() => { if (!cancelled) void loadBranches(); });
    return () => {
      cancelled = true;
    };
  }, [api, semester, branchesRetry]);

  const loadRuns = useCallback(async () => {
    const generation = ++runsGeneration.current;
    setRunsLoading(true);
    setRunsError(null);
    try {
      const rows = await api.get<SeatingRun[]>('/api/exam-cell/seating-runs');
      if (generation !== runsGeneration.current) return;
      setRuns(
        asArray<SeatingRun>(rows).map((run) => ({
          ...run,
          allocations: asArray<SeatingAllocation>(run.allocations),
          total_allocated: Number(run.total_allocated ?? run.allocations?.length ?? 0),
        })),
      );
    } catch (err) {
      if (generation !== runsGeneration.current) return;
      const message = err instanceof Error ? err.message : 'Could not load seating runs';
      toast.error(message);
      setRunsError(message);
      setRuns([]);
    } finally {
      if (generation === runsGeneration.current) setRunsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadRuns(); });
    return () => { cancelled = true; runsGeneration.current += 1; };
  }, [loadRuns]);

  async function allocate() {
    if (pendingAction.current || !parametersReady || selectedHalls.length === 0) return;
    if (strategy === 'by_schedule' && !examId) {
      toast.error('Select an exam schedule');
      return;
    }
    pendingAction.current = true;
    setBusyAction('allocate');
    try {
      const res = await api.post<{ allocated: number; run_id?: string; allocations?: SeatingAllocation[] }>('/api/exam-cell/seating/auto-allocate', {
        allocation_strategy: strategy,
        exam_type: strategy === 'by_exam_type' ? examType : undefined,
        exam_schedule_id: strategy === 'by_schedule' ? examId : undefined,
        semester: Number(semester),
        branch: branch,
        rooms: selectedHalls,
      });
      toast.success(`Allocated ${res.allocated} seats — published to student portal`);
      // Use this operation's response; global history may include another user's newer run.
      const allocations = asArray<SeatingAllocation>(res.allocations);
      setVisualAllocations(allocations);
      setVisualContext(contextKey);
      setVisualScheduleId(strategy === 'by_schedule' ? examId : null);
      setVisualRunId(res.run_id ?? null);
      setShowVisualRooms(allocations.length > 0);
      await loadRuns();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      pendingAction.current = false;
      setBusyAction(null);
    }
  }

  const hallCapacity = useCallback((roomName: string): number => {
    for (const block of blocksData) {
      const hall = block.halls.find((h) => h.name === roomName);
      if (hall) return hall.capacity ?? hall.rows * hall.cols;
    }
    return 60;
  }, [blocksData]);

  async function applyManualSwap() {
    if (pendingAction.current || !parametersReady) return;
    if (!swapRoom || !swapA || !swapB || swapA === swapB) {
      toast.error('Select two different students in the same room');
      return;
    }
    if (strategy !== 'by_schedule' || !examId || visualScheduleId !== examId || !visualCurrent) {
      toast.error('Choose Specific schedule and allocate that schedule before swapping seats');
      return;
    }
    const scheduleId = examId;
    pendingAction.current = true;
    setBusyAction('swap');
    let saved = false;
    try {
      await api.post('/api/exam-cell/seating/swap', {
        exam_schedule_id: scheduleId,
        room: swapRoom,
        student_user_id_a: swapA,
        student_user_id_b: swapB,
      });
      saved = true;
      const refreshed = await api.get<SeatingAllocation[]>(
        `/api/exam-cell/seating-allocations?exam_schedule_id=${scheduleId}`,
      );
      setVisualAllocations(asArray(refreshed));
      toast.success('Seats swapped and saved');
    } catch (e) {
      if (!saved) {
        toast.error(e instanceof Error ? e.message : 'Swap failed');
        return;
      }
      setVisualAllocations([]);
      setShowVisualRooms(false);
      toast.error('Seats were saved, but the refreshed allocation could not be loaded. Reload the schedule before another swap.');
    } finally {
      pendingAction.current = false;
      setBusyAction(null);
    }
    setSwapRoom(null);
    setSwapA('');
    setSwapB('');
  }

  const roomsVisual = useMemo(() => {
    if (!visualCurrent) return [];
    const branchIndex = new Map<string, number>();
    const byRoom = new Map<string, SeatingAllocation[]>();
    for (const a of visualAllocations) {
      if (!byRoom.has(a.room)) byRoom.set(a.room, []);
      byRoom.get(a.room)!.push(a);
    }
    return [...byRoom.entries()].map(([room, items]) => {
      const branchCounts = new Map<string, number>();
      for (const item of items) {
        branchCounts.set(item.branch_code, (branchCounts.get(item.branch_code) ?? 0) + 1);
      }
      const capacity = hallCapacity(room);
      const blockName = blocksData.find((b) => b.halls.some((h) => h.name === room))?.block ?? 'Block';
      return {
        room,
        label: `${blockName} — ${room}`,
        capacity,
        assigned: items.length,
        branches: [...branchCounts.entries()].map(([code, count]) => ({
          code,
          count,
          ...branchStyle(code, branchIndex),
        })),
        students: items,
      };
    });
  }, [visualAllocations, blocksData, visualCurrent, hallCapacity]);

  async function deleteRun(runId: string) {
    if (pendingAction.current) return;
    if (!confirm('Are you sure you want to delete this run?')) return;
    pendingAction.current = true;
    setBusyAction('delete');
    try {
      await api.del(`/api/exam-cell/seating-runs/${runId}`);
      toast.success('Run deleted');
      if (runId === visualRunId) {
        setVisualAllocations([]);
        setShowVisualRooms(false);
      }
      await loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete run');
    } finally {
      pendingAction.current = false;
      setBusyAction(null);
    }
  }

  function exportPDF(run: SeatingRun) {
    const allocations = asArray<SeatingAllocation>(run.allocations);
    const doc = new jsPDF();
    doc.text(`Seating Plan - ${run.allocation_strategy === 'by_exam_type' ? 'Entire Exam' : 'Specific Schedule'}`, 14, 15);
    
    const tableData = allocations.map((a) => [
      a.student_name,
      `${a.student_user_id.split('-')[0]} (${a.branch_code})`,
      ...(run.allocation_strategy === 'by_schedule' ? [a.subject_name || 'N/A', a.exam_date ? String(a.exam_date).slice(0, 10) : 'N/A'] : []),
      `${a.room} - Seat ${a.seat_number}`
    ]);
    
    const head = [
      ['Student Name', 'ID (Branch)', ...(run.allocation_strategy === 'by_schedule' ? ['Subject Name', 'Date'] : []), 'Seat No (Room)']
    ];

    autoTable(doc, { head, body: tableData, startY: 20 });
    doc.save(`seating-plan-${run.run_id.slice(0, 8)}.pdf`);
  }

  const currentBlockHalls = blocksData.find(b => b.block === selectedBlock)?.halls || [];

  const fieldClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
  const btnPrimary =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
  const btnOutline =
    'h-10 border border-[#0B2447] bg-white px-5 text-sm font-semibold text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="seating" />
          {loading ? (
            <p role="status" className="mt-3 text-xs text-muted-foreground">Loading exam schedules and halls…</p>
          ) : null}
          {loadError ? <div role="alert" className="mt-3 text-sm text-destructive">
            <p>{loadError}</p><Button variant="outline" onClick={() => setLoadRetry((value) => value + 1)}>Retry</Button>
          </div> : null}
          {branchesError ? <div role="alert" className="mt-3 text-sm text-destructive">
            <p>{branchesError}</p><Button variant="outline" onClick={() => setBranchesRetry((value) => value + 1)}>Retry branches</Button>
          </div> : null}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Allocation parameters</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Choose strategy, halls, and run auto-allocate before publishing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={strategy === 'by_exam_type' ? btnPrimary : btnOutline}
                disabled={busyAction !== null || loading}
                onClick={() => setStrategy('by_exam_type')}
              >
                Entire exam
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={strategy === 'by_schedule' ? btnPrimary : btnOutline}
                disabled={busyAction !== null || loading}
                onClick={() => setStrategy('by_schedule')}
              >
                Specific schedule
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {strategy === 'by_exam_type' ? (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Exam type</label>
                <Select aria-label="Exam type" disabled={busyAction !== null || loading} className={fieldClass} value={examType} onChange={(e) => setExamType(e.target.value)}>
                  <option value="MID_TERM">Mid Term</option>
                  <option value="END_TERM">End Term</option>
                </Select>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Exam schedule</label>
                <Select aria-label="Exam schedule" disabled={busyAction !== null || loading} className={fieldClass} value={examId} onChange={(e) => setExamId(e.target.value)}>
                  <option value="">Select schedule</option>
                  {schedules.map((s) => (
                    <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                      {s.subject_name ? `${s.subject_name} (${s.subject_code})` : s.exam_type} · {String(s.exam_date).slice(0, 10)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Semester</label>
              <Select aria-label="Semester" disabled={busyAction !== null || loading} className={fieldClass} value={semester} onChange={(e) => { setSemester(e.target.value); setBranch('All Branches'); setBranchesLoading(true); }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Branch</label>
              <Select aria-label="Branch" disabled={busyAction !== null || loading || branchesLoading || !!branchesError} className={fieldClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="All Branches">All Branches</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Block</label>
              <Select
                className={fieldClass}
                aria-label="Block"
                disabled={busyAction !== null || loading}
                value={selectedBlock}
                onChange={(e) => {
                  setSelectedBlock(e.target.value);
                  setSelectedHalls([]);
                }}
              >
                {blocksData.map((b) => (
                  <option key={b.block} value={b.block}>{b.block}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className={labelClass}>Halls in {selectedBlock || 'selected block'}</label>
              <p className="text-xs text-muted-foreground">
                {selectedHalls.length} selected
              </p>
            </div>
            {currentBlockHalls.length === 0 ? (
              <p className="text-sm text-muted-foreground">No halls available for this block.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {currentBlockHalls.map((h) => {
                  const checked = selectedHalls.includes(h.name);
                  return (
                    <label
                      key={h.name}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-sm transition-colors ${
                        checked
                          ? 'border-[#0B2447] ring-1 ring-[#0B2447]/20'
                          : 'border-sgvu-navy/15 hover:border-sgvu-navy/35'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={busyAction !== null || !parametersReady}
                        className="h-4 w-4 accent-[#0B2447]"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedHalls([...selectedHalls, h.name]);
                          else setSelectedHalls(selectedHalls.filter((x) => x !== h.name));
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-sgvu-navy">{h.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {h.rows}×{h.cols} · {h.capacity} seats
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button
              className={btnPrimary}
              onClick={() => void allocate()}
              disabled={busyAction !== null || !parametersReady || selectedHalls.length === 0}
            >
              {busyAction === 'allocate' ? 'Allocating…' : 'Auto-allocate seats'}
            </Button>
            <Button
              variant="outline"
              className={btnOutline}
              onClick={() => void publishPlans()}
              disabled={busyAction !== null || !parametersReady}
            >
              {busyAction === 'publish' ? 'Publishing…' : 'Publish to student portal'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showVisualRooms && roomsVisual.length > 0 ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5 md:p-6">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Visual room allocation</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Verify capacity and branch mixing — adjacent seats should alternate branches.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roomsVisual.map((room) => (
                <div key={room.room} className="rounded-xl border border-sgvu-navy/10 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-bold text-sgvu-navy">{room.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Capacity {room.capacity} · Assigned {room.assigned}
                    </p>
                    <Progress value={Math.min(100, (room.assigned / room.capacity) * 100)} className="mt-2 h-2" />
                  </div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sgvu-navy/50">
                    Branch mix
                  </p>
                  <div className="space-y-2">
                    {room.branches.map((b) => (
                      <div key={b.code} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <Badge variant="outline" className={b.badge}>
                            {b.count} {b.code}
                          </Badge>
                          <span className="text-muted-foreground">
                            {Math.round((b.count / room.assigned) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full ${b.bar}`}
                            style={{ width: `${(b.count / room.assigned) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`mt-4 w-full ${btnOutline}`}
                    disabled={busyAction !== null}
                    onClick={() => {
                      if (strategy !== 'by_schedule' || visualScheduleId !== examId) {
                        toast.error('Choose Specific schedule and allocate that schedule before swapping seats');
                        return;
                      }
                      setSwapRoom(room.room);
                      setSwapA('');
                      setSwapB('');
                    }}
                  >
                    Manually swap student
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-sgvu-navy">Seating plan history</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {runsLoading ? 'Loading seating plan history…' : runsError ? 'Seating plan history unavailable' : runs.length === 0
                ? 'No seating plans generated yet'
                : `${runs.length} plan${runs.length === 1 ? '' : 's'} on record`}
            </p>
          </div>

          {runsLoading ? <p role="status" className="text-sm text-muted-foreground">Loading seating plans…</p> : runsError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p>{runsError}</p><Button variant="outline" disabled={busyAction !== null} onClick={() => void loadRuns()}>Retry</Button>
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-sgvu-navy">No seating plans yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Select halls and run Auto-allocate seats to create the first plan.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {runs.map((r) => (
                <div key={r.run_id} className="flex flex-col rounded-xl border border-sgvu-navy/10 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-bold text-sgvu-navy">
                      {r.allocation_strategy === 'by_exam_type' ? 'Entire exam' : 'Specific schedule'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="mb-4 flex-1 space-y-1.5 text-sm text-sgvu-navy/80">
                    <p><span className="font-semibold text-sgvu-navy">Semester:</span> {r.semester}</p>
                    <p><span className="font-semibold text-sgvu-navy">Branch:</span> {r.branch}</p>
                    {r.allocation_strategy === 'by_schedule' ? (
                      <>
                        <p className="truncate">
                          <span className="font-semibold text-sgvu-navy">Subject:</span> {r.subject_name || 'N/A'}
                        </p>
                        <p>
                          <span className="font-semibold text-sgvu-navy">Date:</span>{' '}
                          {r.exam_date ? String(r.exam_date).slice(0, 10) : 'N/A'}
                        </p>
                      </>
                    ) : null}
                    <p>
                      <span className="font-semibold text-sgvu-navy">Allocated:</span>{' '}
                      <span className="rounded-md bg-sgvu-navy/[0.06] px-1.5 py-0.5 text-xs font-bold text-sgvu-navy">
                        {r.total_allocated} seats
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={btnPrimary}
                      onClick={() => setViewingRun(r)}
                    >
                      View details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={btnOutline}
                      onClick={() => exportPDF(r)}
                    >
                      Export PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 border-red-600/30 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
                      disabled={busyAction !== null}
                      onClick={() => void deleteRun(r.run_id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingRun} onOpenChange={(open) => !open && setViewingRun(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle>Seating Plan Details</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {viewingRun && (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="py-2">Student Name</th>
                    <th className="py-2">ID (Branch)</th>
                    {viewingRun.allocation_strategy === 'by_schedule' && (
                      <>
                        <th className="py-2">Subject Name</th>
                        <th className="py-2">Date</th>
                      </>
                    )}
                    <th className="py-2">Seat No (Room)</th>
                  </tr>
                </thead>
                <tbody>
                  {asArray<SeatingAllocation>(viewingRun.allocations).map((a, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-2">{a.student_name}</td>
                      <td className="py-2 text-muted-foreground">{a.student_user_id.split('-')[0]} ({a.branch_code})</td>
                      {viewingRun.allocation_strategy === 'by_schedule' && (
                        <>
                          <td className="py-2">{a.subject_name || 'N/A'}</td>
                          <td className="py-2">{a.exam_date ? String(a.exam_date).slice(0, 10) : 'N/A'}</td>
                        </>
                      )}
                      <td className="py-2 font-mono text-xs">{a.room} - Seat {a.seat_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!swapRoom} onOpenChange={(open) => !open && busyAction === null && setSwapRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manually swap students — {swapRoom}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Select aria-label="Student A" disabled={busyAction !== null} className={fieldClass} value={swapA} onChange={(e) => setSwapA(e.target.value)}>
              <option value="">Student A</option>
              {visualAllocations
                .filter((a) => a.room === swapRoom)
                .map((a) => (
                  <option key={a.student_user_id} value={a.student_user_id}>
                    {a.student_name} · Seat {a.seat_number} ({a.branch_code})
                  </option>
                ))}
            </Select>
            <Select aria-label="Student B" disabled={busyAction !== null} className={fieldClass} value={swapB} onChange={(e) => setSwapB(e.target.value)}>
              <option value="">Student B</option>
              {visualAllocations
                .filter((a) => a.room === swapRoom)
                .map((a) => (
                  <option key={`b-${a.student_user_id}`} value={a.student_user_id}>
                    {a.student_name} · Seat {a.seat_number} ({a.branch_code})
                  </option>
                ))}
            </Select>
          </div>
          <DialogFooter>
            <Button disabled={busyAction !== null} variant="outline" className={btnOutline} onClick={() => setSwapRoom(null)}>
              Cancel
            </Button>
            <Button disabled={busyAction !== null} className={btnPrimary} onClick={applyManualSwap}>
              {busyAction === 'swap' ? 'Swapping…' : 'Swap seats'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

