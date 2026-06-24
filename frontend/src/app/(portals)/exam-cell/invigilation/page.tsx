'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthedApi } from '@/lib/api';
import { ChevronDown, ChevronRight } from 'lucide-react';

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

type BlockHall = { block: string; halls: { name: string; capacity: number }[] };

export default function ExamCellInvigilationPage() {
  const api = useAuthedApi();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [blocksHalls, setBlocksHalls] = useState<BlockHall[]>([]);

  const [examId, setExamId] = useState('');
  const [block, setBlock] = useState('');
  const [room, setRoom] = useState('');
  const [facultyId, setFacultyId] = useState('');

  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  const [resolvingRequest, setResolvingRequest] = useState<{ req: Request, action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [resolveComment, setResolveComment] = useState('');

  const load = useCallback(() => {
    void api.get<Duty[]>('/api/exam-cell/invigilation').then(setDuties);
    void api.get<Request[]>('/api/exam-cell/invigilation-requests').then(setRequests);
  }, [api]);

  useEffect(() => {
    load();
    void api.get<BlockHall[]>('/api/exam-cell/blocks-halls').then((data) => {
      setBlocksHalls(data);
      if (data.length > 0) setBlock(data[0].block);
    });
    void api.get<Schedule[]>('/api/exam-cell/schedules').then((s) => {
      setSchedules(s);
      if (s.length > 0) setExamId(s[0].exam_schedule_id);
    });
  }, [api, load]);

  useEffect(() => {
    const selectedSchedule = schedules.find((s) => s.exam_schedule_id === examId);
    if (selectedSchedule) {
      const dateStr = String(selectedSchedule.exam_date).slice(0, 10);
      void api.get<Faculty[]>(`/api/exam-cell/faculty-roster?date=${dateStr}`).then(setFaculty);
    } else {
      void api.get<Faculty[]>('/api/exam-cell/faculty-roster').then(setFaculty);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Invigilation Roster</h1>
        <p className="text-sm text-muted-foreground">Assignments sync instantly to Faculty → Exam Invigilation Duty.</p>
      </div>

      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roster">Roster Management</TabsTrigger>
          <TabsTrigger value="requests">
            Unavailability Requests
            {requests.filter(r => r.status === 'PENDING').length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0.5 text-[10px]">
                {requests.filter(r => r.status === 'PENDING').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Assign faculty to room</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <Select className="w-full rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
                  {schedules.map((s) => (
                    <option key={s.exam_schedule_id} value={s.exam_schedule_id}>{s.exam_type} · {String(s.exam_date).slice(0, 10)}</option>
                  ))}
                </Select>
              </div>
              <Select className="rounded-md border px-3 py-2 text-sm" value={block} onChange={(e) => {
                setBlock(e.target.value);
                setRoom('');
              }}>
                <option value="">Select Block</option>
                {blocksHalls.map((b) => (
                  <option key={b.block} value={b.block}>{b.block}</option>
                ))}
              </Select>
              <Select className="rounded-md border px-3 py-2 text-sm" value={room} onChange={(e) => setRoom(e.target.value)} disabled={!block}>
                <option value="">Select Hall</option>
                {selectedBlockHalls.map((h) => (
                  <option key={h.name} value={h.name}>{h.name}</option>
                ))}
              </Select>
              <div className="sm:col-span-2 lg:col-span-4">
                <Select className="w-full rounded-md border px-3 py-2 text-sm" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
                  <option value="">Select available faculty</option>
                  {faculty.map((f) => (
                    <option key={f.user_id} value={f.user_id}>{f.name}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-between items-center mt-2">
                <Button onClick={() => void assign()} disabled={!room || !facultyId || !examId}>Assign</Button>
                <Button variant="secondary" onClick={() => void publish()}>Publish roster to faculty</Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-sgvu-navy">Assigned Invigilators</h2>
            {dutiesByBlock.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No faculty assigned yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {dutiesByBlock.map(({ blockName, items }) => (
                  <Card key={blockName} className="overflow-hidden">
                    <div 
                      className="flex cursor-pointer items-center justify-between bg-slate-50 p-4 hover:bg-slate-100 transition-colors"
                      onClick={() => setExpandedBlock(expandedBlock === blockName ? null : blockName)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sgvu-navy/10 text-sgvu-navy">
                          {expandedBlock === blockName ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>
                        <h3 className="font-semibold text-sgvu-navy">{blockName}</h3>
                        <Badge variant="secondary" className="ml-2">{items.length} assigned</Badge>
                      </div>
                    </div>
                    {expandedBlock === blockName && (
                      <div className="border-t bg-white p-0">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50/50">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold">Hall No.</th>
                              <th className="px-4 py-3 text-left font-semibold">Faculty Name</th>
                              <th className="px-4 py-3 text-left font-semibold">Faculty ID</th>
                              <th className="px-4 py-3 text-left font-semibold">Exam Date</th>
                              <th className="px-4 py-3 text-right font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((d) => (
                              <tr key={d.duty_id} className="border-t hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-medium">{d.room}</td>
                                <td className="px-4 py-3">{d.faculty_name}</td>
                                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{d.faculty_user_id.split('-')[0]}</td>
                                <td className="px-4 py-3 text-muted-foreground">{String(d.exam_date).slice(0, 10)}</td>
                                <td className="px-4 py-3 text-right">
                                  <Badge variant={d.published ? 'default' : 'outline'}>
                                    {d.published ? 'Published' : d.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          {requests.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              No unavailability requests found.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {requests.map((r) => (
                <Card key={r.request_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{r.faculty_name}</CardTitle>
                      <Badge variant={r.status === 'APPROVED' ? 'default' : r.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.session_label} · Room {r.room}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.exam_date).toLocaleDateString()}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                      <p className="font-medium mb-1 text-xs text-muted-foreground">Reason for Unavailability:</p>
                      <p>{r.reason}</p>
                    </div>

                    {r.status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setResolvingRequest({ req: r, action: 'REJECTED' })}
                        >
                          Reject
                        </Button>
                        <Button
                          className="w-full bg-sgvu-navy hover:bg-sgvu-navy/90"
                          onClick={() => setResolvingRequest({ req: r, action: 'APPROVED' })}
                        >
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground border-t pt-2">
                        <span className="font-medium">Comment:</span> {r.exam_cell_comment}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
              <label className="text-sm font-medium">Commit Message / Comment</label>
              <textarea
                className="w-full rounded-md border p-3 text-sm min-h-[100px]"
                placeholder={resolvingRequest?.action === 'APPROVED' ? 'E.g., Approved due to medical reasons. Roster updated.' : 'E.g., Request denied. You must attend this invigilation duty.'}
                value={resolveComment}
                onChange={(e) => setResolveComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolvingRequest(null)}>Cancel</Button>
            <Button
              variant={resolvingRequest?.action === 'APPROVED' ? 'default' : 'destructive'}
              onClick={() => void submitResolution()}
              disabled={!resolveComment.trim()}
            >
              Confirm {resolvingRequest?.action === 'APPROVED' ? 'Approval' : 'Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
