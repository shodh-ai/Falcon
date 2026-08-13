'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthedApi } from '@/lib/api';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

type Duty = {
  duty_id: string;
  faculty_name: string;
  faculty_user_id: string;
  room: string;
  exam_type: string;
  exam_date: string;
  start_time: string;
  published: boolean;
  status: string;
};

type Faculty = { user_id: string; name: string };
type Schedule = { exam_schedule_id: string; exam_type: string; exam_date: string };

type Request = {
  request_id: string;
  faculty_name: string;
  room: string;
  exam_date: string;
  session_label: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  exam_cell_comment: string | null;
};

type DutySwap = {
  swap_id: string;
  requester_name: string;
  target_name: string;
  room: string;
  exam_date: string;
  session_label: string | null;
  reason: string;
  status:
    | 'PENDING_TARGET'
    | 'REJECTED_BY_TARGET'
    | 'PENDING_EXAM_CELL'
    | 'APPROVED'
    | 'REJECTED_BY_EXAM_CELL'
    | 'CANCELLED';
  target_comment: string | null;
  exam_cell_comment: string | null;
};

type BlockHall = { block: string; halls: { name: string; capacity: number }[] };

export default function ExamCellInvigilationPage() {
  const api = useAuthedApi();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [swaps, setSwaps] = useState<DutySwap[]>([]);
  const [blocksHalls, setBlocksHalls] = useState<BlockHall[]>([]);

  const [examId, setExamId] = useState('');
  const [block, setBlock] = useState('');
  const [room, setRoom] = useState('');
  const [facultyId, setFacultyId] = useState('');

  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  const [resolvingRequest, setResolvingRequest] = useState<{ req: Request, action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [resolveComment, setResolveComment] = useState('');
  const [resolvingSwap, setResolvingSwap] = useState<{ swap: DutySwap; action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [swapResolveComment, setSwapResolveComment] = useState('');
  const [reassignDuty, setReassignDuty] = useState<Duty | null>(null);
  const [reassignFacultyId, setReassignFacultyId] = useState('');

  const load = useCallback(() => {
    void api.get<Duty[]>('/api/exam-cell/invigilation').then(setDuties);
    void api.get<Request[]>('/api/exam-cell/invigilation-requests').then(setRequests);
    void api
      .get<DutySwap[]>('/api/exam-cell/invigilation-swaps')
      .then((rows) => setSwaps(Array.isArray(rows) ? rows : []))
      .catch(() => setSwaps([]));
  }, [api]);

  useEffect(() => {
    load();
    void api.get<BlockHall[]>('/api/exam-cell/blocks-halls').then((data) => {
      const rows = Array.isArray(data) ? data : [];
      setBlocksHalls(rows);
      if (rows[0]?.block) setBlock(rows[0].block);
    });
    void api.get<Schedule[]>('/api/exam-cell/schedules').then((data) => {
      const rows = Array.isArray(data) ? data : [];
      setSchedules(rows);
      if (rows[0]) setExamId(rows[0].exam_schedule_id);
    });
  }, [api, load]);

  useEffect(() => {
    const selectedSchedule = schedules.find((s) => s.exam_schedule_id === examId);
    if (selectedSchedule) {
      const dateStr = String(selectedSchedule.exam_date).slice(0, 10);
      void api.get<Faculty[]>(`/api/exam-cell/faculty-roster?date=${dateStr}`).then((data) => {
        setFaculty(Array.isArray(data) ? data : []);
      });
    } else {
      void api.get<Faculty[]>('/api/exam-cell/faculty-roster').then((data) => {
        setFaculty(Array.isArray(data) ? data : []);
      });
    }
  }, [examId, schedules, api]);

  async function assign() {
    if (!room) {
      toast.error('Select a room');
      return;
    }
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

  async function autoAssign() {
    if (!examId) {
      toast.error('Select an exam schedule first');
      return;
    }
    try {
      const res = await api.post<{ assigned: number; rooms: number }>('/api/exam-cell/invigilation/auto-assign', {
        exam_schedule_id: examId,
      });
      toast.success(`Auto-assigned ${res.assigned} invigilators across ${res.rooms} rooms (leave & workload checked)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Auto-assign failed');
    }
  }

  async function submitResolution() {
    if (!resolvingRequest) return;
    if (!resolveComment.trim()) {
      toast.error('Comment is required');
      return;
    }
    try {
      await api.post(`/api/exam-cell/invigilation-requests/${resolvingRequest.req.request_id}/resolve`, {
        status: resolvingRequest.action,
        comment: resolveComment
      });
      toast.success(`Request ${resolvingRequest.action.toLowerCase()}`);
      setResolvingRequest(null);
      setResolveComment('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resolve request');
    }
  }

  async function submitSwapResolution() {
    if (!resolvingSwap) return;
    if (!swapResolveComment.trim()) {
      toast.error('Comment is required');
      return;
    }
    try {
      await api.post(`/api/exam-cell/invigilation-swaps/${resolvingSwap.swap.swap_id}/resolve`, {
        status: resolvingSwap.action,
        comment: swapResolveComment.trim(),
      });
      toast.success(
        resolvingSwap.action === 'APPROVED'
          ? 'Duty swap approved — roster updated'
          : 'Duty swap rejected',
      );
      setResolvingSwap(null);
      setSwapResolveComment('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resolve swap');
    }
  }

  const pendingSwaps = useMemo(
    () => swaps.filter((s) => s.status === 'PENDING_EXAM_CELL'),
    [swaps],
  );

  const selectedBlockHalls = blocksHalls.find((b) => b.block === block)?.halls || [];

  const dutiesByBlock = useMemo(() => {
    const map = new Map<string, Duty[]>();
    duties.forEach(d => {
      let bName = 'Other';
      for (const b of blocksHalls) {
        if (b.halls.some(h => h.name === d.room)) {
          bName = b.block;
          break;
        }
      }
      if (!map.has(bName)) map.set(bName, []);
      map.get(bName)!.push(d);
    });
    return Array.from(map.entries())
      .map(([blockName, items]) => ({ blockName, items }))
      .sort((a, b) => a.blockName.localeCompare(b.blockName));
  }, [duties, blocksHalls]);

  const leaveConflicts = useMemo(() => {
    const approvedLeaves = requests.filter((r) => r.status === 'APPROVED');
    const conflicts = duties.filter((d) =>
      approvedLeaves.some(
        (r) =>
          r.faculty_name === d.faculty_name &&
          String(r.exam_date).slice(0, 10) === String(d.exam_date).slice(0, 10),
      ),
    );
    return conflicts;
  }, [duties, requests]);

  const conflictDutyIds = useMemo(
    () => new Set(leaveConflicts.map((d) => d.duty_id)),
    [leaveConflicts],
  );

  async function quickReassign() {
    if (!reassignDuty || !reassignFacultyId) return;
    const replacement = faculty.find((f) => f.user_id === reassignFacultyId);
    try {
      await api.post('/api/exam-cell/invigilation/assign', {
        exam_schedule_id: examId,
        room: reassignDuty.room,
        faculty_user_id: reassignFacultyId,
      });
      setDuties((prev) =>
        prev.map((d) =>
          d.duty_id === reassignDuty.duty_id
            ? { ...d, faculty_name: replacement?.name ?? d.faculty_name, faculty_user_id: reassignFacultyId }
            : d,
        ),
      );
      toast.success(`Re-assigned ${reassignDuty.room} to ${replacement?.name ?? 'faculty'}`);
      setReassignDuty(null);
      setReassignFacultyId('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Re-assign failed');
    }
  }

  const fieldClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
  const btnPrimary =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';
  const btnOutline =
    'h-10 border border-[#0B2447] bg-white px-5 text-sm font-semibold text-[#0B2447] transition-colors hover:bg-[#0B2447]/5 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  const roomOptions = selectedBlockHalls;
  const roomValue = roomOptions.some((h) => h.name === room) ? room : undefined;
  const facultyValue = faculty.some((f) => f.user_id === facultyId) ? facultyId : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="invigilation" />
        </CardContent>
      </Card>

      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto rounded-xl border border-sgvu-navy/10 bg-white p-1 shadow-sm sm:w-auto">
          <TabsTrigger
            value="roster"
            className="rounded-lg px-4 py-2 text-sm font-semibold data-[state=active]:bg-[#0B2447] data-[state=active]:text-white"
          >
            Roster Management
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className="rounded-lg px-4 py-2 text-sm font-semibold data-[state=active]:bg-[#0B2447] data-[state=active]:text-white"
          >
            Unavailability Requests
            {requests.filter((r) => r.status === 'PENDING').length > 0 ? (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-[10px]">
                {requests.filter((r) => r.status === 'PENDING').length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="swaps"
            className="rounded-lg px-4 py-2 text-sm font-semibold data-[state=active]:bg-[#0B2447] data-[state=active]:text-white"
          >
            Duty Swaps
            {pendingSwaps.length > 0 ? (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-[10px]">
                {pendingSwaps.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-5">
          {leaveConflicts.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Alert: {leaveConflicts.length} assigned invigilator
                {leaveConflicts.length === 1 ? '' : 's'} had leave approved by HOD for upcoming exam dates.
                Immediate re-assignment required.
              </p>
              <ul className="mt-2 list-inside list-disc text-xs">
                {leaveConflicts.map((d) => (
                  <li key={d.duty_id}>
                    {d.faculty_name} — Room {d.room} · {String(d.exam_date).slice(0, 10)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="space-y-5 p-5 md:p-6">
              <div className="border-b border-sgvu-navy/10 pb-4">
                <h2 className="text-lg font-bold text-sgvu-navy">Assign faculty to room</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Choose schedule, hall, and available faculty, then assign or auto-assign.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Exam schedule</label>
                  <Select className={fieldClass} value={examId || undefined} onChange={(e) => setExamId(e.target.value)}>
                    {schedules.map((s) => (
                      <option key={s.exam_schedule_id} value={s.exam_schedule_id}>
                        {s.exam_type} · {String(s.exam_date).slice(0, 10)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Block</label>
                  <Select
                    className={fieldClass}
                    value={block || undefined}
                    onChange={(e) => {
                      setBlock(e.target.value);
                      setRoom('');
                    }}
                  >
                    {blocksHalls.map((b) => (
                      <option key={b.block} value={b.block}>{b.block}</option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Hall</label>
                  <Select
                    key={`hall-${block}-${roomOptions.map((h) => h.name).join('|')}`}
                    className={fieldClass}
                    value={roomValue}
                    placeholder={roomOptions.length === 0 ? 'No halls in block' : 'Select hall'}
                    disabled={!block || roomOptions.length === 0}
                    onChange={(e) => setRoom(e.target.value)}
                  >
                    {roomOptions.length === 0 ? <option value="">No halls in block</option> : null}
                    {roomOptions.map((h) => (
                      <option key={h.name} value={h.name}>
                        {h.name} — capacity {h.capacity}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Faculty</label>
                  <Select
                    key={`faculty-${examId}-${faculty.length}`}
                    className={fieldClass}
                    value={facultyValue}
                    placeholder="Select available faculty"
                    onChange={(e) => setFacultyId(e.target.value)}
                  >
                    {faculty.length === 0 ? <option value="">No available faculty</option> : null}
                    {faculty.map((f) => (
                      <option key={f.user_id} value={f.user_id}>{f.name}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only faculty without HOD-approved leave on the selected exam date are listed.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.02] p-4">
                <p className={`${labelClass} mb-3`}>Actions</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Button
                    variant="outline"
                    className={`${btnPrimary} h-11 w-full`}
                    onClick={() => void assign()}
                    disabled={!room || !facultyId || !examId}
                  >
                    Assign
                  </Button>
                  <Button
                    variant="outline"
                    className={`${btnPrimary} h-11 w-full`}
                    onClick={() => void autoAssign()}
                    disabled={!examId}
                  >
                    Auto-assign
                  </Button>
                  <Button
                    variant="outline"
                    className={`${btnPrimary} h-11 w-full`}
                    onClick={() => void publish()}
                  >
                    Publish roster
                  </Button>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <p className="text-center text-[11px] text-muted-foreground">
                    Assign selected faculty to the hall
                  </p>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Fill all halls using availability checks
                  </p>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Sync the roster to faculty portal
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5 md:p-6">
              <div>
                <h2 className="text-lg font-bold text-sgvu-navy">Assigned invigilators</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {dutiesByBlock.length === 0
                    ? 'No faculty assigned yet'
                    : `${duties.length} assignment${duties.length === 1 ? '' : 's'} across ${dutiesByBlock.length} block${dutiesByBlock.length === 1 ? '' : 's'}`}
                </p>
              </div>

              {dutiesByBlock.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-sgvu-navy">No faculty assigned yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Assign a faculty member to a hall, or run Auto-assign.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dutiesByBlock.map(({ blockName, items }) => (
                    <div key={blockName} className="overflow-hidden rounded-xl border border-sgvu-navy/10">
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between bg-sgvu-navy/[0.03] px-4 py-3 text-left transition-colors hover:bg-sgvu-navy/[0.06]"
                        onClick={() => setExpandedBlock(expandedBlock === blockName ? null : blockName)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B2447]/10 text-sgvu-navy">
                            {expandedBlock === blockName ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </span>
                          <span className="font-semibold text-sgvu-navy">{blockName}</span>
                          <Badge variant="secondary">{items.length} assigned</Badge>
                        </div>
                      </button>
                      {expandedBlock === blockName ? (
                        <div className="overflow-x-auto border-t border-sgvu-navy/10 bg-white">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-sgvu-navy/10 text-left text-xs uppercase tracking-wide text-sgvu-navy/50">
                                <th className="px-4 py-2.5 font-bold">Hall</th>
                                <th className="px-4 py-2.5 font-bold">Faculty</th>
                                <th className="px-4 py-2.5 font-bold">Faculty ID</th>
                                <th className="px-4 py-2.5 font-bold">Exam date</th>
                                <th className="px-4 py-2.5 text-right font-bold">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-sgvu-navy/10">
                              {items.map((d) => (
                                <tr
                                  key={d.duty_id}
                                  className={`hover:bg-sgvu-navy/[0.02] ${conflictDutyIds.has(d.duty_id) ? 'bg-red-50/40' : ''}`}
                                >
                                  <td className="px-4 py-3 font-semibold text-sgvu-navy">{d.room}</td>
                                  <td className="px-4 py-3">
                                    {d.faculty_name}
                                    {conflictDutyIds.has(d.duty_id) ? (
                                      <Badge variant="destructive" className="ml-2 text-[10px]">On leave</Badge>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                    {d.faculty_user_id.split('-')[0]}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {String(d.exam_date).slice(0, 10)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {conflictDutyIds.has(d.duty_id) ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 border-red-200 text-red-700"
                                          onClick={() => {
                                            setReassignDuty(d);
                                            setReassignFacultyId('');
                                          }}
                                        >
                                          Re-assign
                                        </Button>
                                      ) : null}
                                      <Badge variant={d.published ? 'default' : 'outline'}>
                                        {d.published ? 'Published' : d.status}
                                      </Badge>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5 md:p-6">
              <div>
                <h2 className="text-lg font-bold text-sgvu-navy">Unavailability requests</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {requests.length === 0
                    ? 'No requests found'
                    : `${requests.length} request${requests.length === 1 ? '' : 's'}`}
                </p>
              </div>

              {requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-sgvu-navy">No unavailability requests</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Faculty requests will appear here for exam-cell review.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {requests.map((r) => (
                    <article key={r.request_id} className="rounded-xl border border-sgvu-navy/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-sgvu-navy">{r.faculty_name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {r.session_label} · Room {r.room}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(r.exam_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant={
                            r.status === 'APPROVED'
                              ? 'default'
                              : r.status === 'REJECTED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {r.status}
                        </Badge>
                      </div>

                      <div className="mt-3 rounded-lg bg-sgvu-navy/[0.03] px-3 py-2.5 text-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-sgvu-navy/50">
                          Reason
                        </p>
                        <p className="mt-1 text-sgvu-navy/80">{r.reason}</p>
                      </div>

                      {r.status === 'PENDING' ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="outline"
                            className="h-10 flex-1 border-red-600/30 font-semibold text-red-700 hover:bg-red-50"
                            onClick={() => setResolvingRequest({ req: r, action: 'REJECTED' })}
                          >
                            Reject
                          </Button>
                          <Button
                            className={`flex-1 ${btnPrimary}`}
                            onClick={() => setResolvingRequest({ req: r, action: 'APPROVED' })}
                          >
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-3 border-t border-sgvu-navy/10 pt-3 text-sm text-muted-foreground">
                          <span className="font-semibold text-sgvu-navy">Comment:</span> {r.exam_cell_comment}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="swaps" className="space-y-4">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5 md:p-6">
              <div>
                <h2 className="text-lg font-bold text-sgvu-navy">Duty swap approvals</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Peer-accepted swaps await Exam Cell approval before the roster updates.
                </p>
              </div>

              {swaps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-sgvu-navy">No duty swap requests</p>
                </div>
              ) : (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  {swaps.map((s) => (
                    <article key={s.swap_id} className="min-w-0 rounded-xl border border-sgvu-navy/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-sgvu-navy">
                            {s.requester_name} → {s.target_name}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {s.session_label ?? 'Invigilation'} · Room {s.room}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(s.exam_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant={
                            s.status === 'APPROVED'
                              ? 'default'
                              : s.status === 'PENDING_EXAM_CELL'
                                ? 'secondary'
                                : s.status.includes('REJECT')
                                  ? 'destructive'
                                  : 'outline'
                          }
                        >
                          {s.status.replaceAll('_', ' ')}
                        </Badge>
                      </div>
                      <div className="mt-3 rounded-lg bg-sgvu-navy/[0.03] px-3 py-2.5 text-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-sgvu-navy/50">
                          Reason
                        </p>
                        <p className="mt-1 break-words text-sgvu-navy/80">{s.reason}</p>
                        {s.target_comment ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Peer note: {s.target_comment}
                          </p>
                        ) : null}
                      </div>
                      {s.status === 'PENDING_EXAM_CELL' ? (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <Button
                            variant="outline"
                            className="h-10 flex-1 border-red-600/30 font-semibold text-red-700 hover:bg-red-50"
                            onClick={() => setResolvingSwap({ swap: s, action: 'REJECTED' })}
                          >
                            Reject
                          </Button>
                          <Button
                            className={`flex-1 ${btnPrimary}`}
                            onClick={() => setResolvingSwap({ swap: s, action: 'APPROVED' })}
                          >
                            Approve swap
                          </Button>
                        </div>
                      ) : s.exam_cell_comment ? (
                        <p className="mt-3 border-t border-sgvu-navy/10 pt-3 text-sm text-muted-foreground">
                          <span className="font-semibold text-sgvu-navy">Comment:</span>{' '}
                          {s.exam_cell_comment}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!resolvingRequest} onOpenChange={(open) => !open && setResolvingRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resolvingRequest?.action === 'APPROVED' ? 'Approve Unavailability' : 'Reject Unavailability'}
            </DialogTitle>
            <DialogDescription>
              {resolvingRequest?.action === 'APPROVED'
                ? 'Approving this request will excuse the faculty and delete their assignment, freeing up the room.'
                : 'Rejecting this request will keep the assignment active.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className={labelClass}>Commit message / comment</label>
              <textarea
                className="min-h-[100px] w-full rounded-lg border border-sgvu-navy/20 p-3 text-sm focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25"
                placeholder={
                  resolvingRequest?.action === 'APPROVED'
                    ? 'E.g., Approved due to medical reasons. Roster updated.'
                    : 'E.g., Request denied. You must attend this invigilation duty.'
                }
                value={resolveComment}
                onChange={(e) => setResolveComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className={btnOutline} onClick={() => setResolvingRequest(null)}>
              Cancel
            </Button>
            <Button
              className={resolvingRequest?.action === 'APPROVED' ? btnPrimary : undefined}
              variant={resolvingRequest?.action === 'APPROVED' ? 'default' : 'destructive'}
              onClick={() => void submitResolution()}
              disabled={!resolveComment.trim()}
            >
              Confirm {resolvingRequest?.action === 'APPROVED' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolvingSwap} onOpenChange={(open) => !open && setResolvingSwap(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {resolvingSwap?.action === 'APPROVED' ? 'Approve duty swap' : 'Reject duty swap'}
            </DialogTitle>
            <DialogDescription>
              {resolvingSwap?.action === 'APPROVED'
                ? 'Approving transfers the invigilation duty to the accepting faculty and notifies both parties.'
                : 'Rejecting keeps the original faculty assignment and notifies both parties.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <label className={labelClass}>Comment</label>
            <textarea
              className="min-h-[100px] w-full min-w-0 rounded-lg border border-sgvu-navy/20 p-3 text-sm focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25"
              value={swapResolveComment}
              onChange={(e) => setSwapResolveComment(e.target.value)}
              placeholder="Decision rationale for audit trail"
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className={btnOutline} onClick={() => setResolvingSwap(null)}>
              Cancel
            </Button>
            <Button
              className={resolvingSwap?.action === 'APPROVED' ? btnPrimary : undefined}
              variant={resolvingSwap?.action === 'APPROVED' ? 'default' : 'destructive'}
              onClick={() => void submitSwapResolution()}
              disabled={!swapResolveComment.trim()}
            >
              Confirm {resolvingSwap?.action === 'APPROVED' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reassignDuty} onOpenChange={(open) => !open && setReassignDuty(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Re-assign — Room {reassignDuty?.room}</DialogTitle>
            <DialogDescription>
              Replace {reassignDuty?.faculty_name} with an available faculty member (no approved leave on exam date).
            </DialogDescription>
          </DialogHeader>
          <Select
            className={fieldClass}
            value={reassignFacultyId || undefined}
            placeholder="Select replacement faculty"
            onChange={(e) => setReassignFacultyId(e.target.value)}
          >
            {faculty
              .filter((f) => f.user_id !== reassignDuty?.faculty_user_id)
              .map((f) => (
                <option key={f.user_id} value={f.user_id}>
                  {f.name}
                </option>
              ))}
          </Select>
          <DialogFooter>
            <Button variant="outline" className={btnOutline} onClick={() => setReassignDuty(null)}>
              Cancel
            </Button>
            <Button className={btnPrimary} disabled={!reassignFacultyId} onClick={() => void quickReassign()}>
              Confirm re-assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
