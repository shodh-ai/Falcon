'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, MapPin, Calendar, AlertCircle, ArrowLeftRight } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoDuties } from '@/lib/mock/faculty-portal-demo';

type Duty = {
  assignment_id: string;
  exam_date: string;
  block_name: string | null;
  room: string;
  session_label: string | null;
  excuse_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  excuse_reason: string | null;
  exam_cell_comment: string | null;
};

type SwapPartner = { user_id: string; name: string; official_email?: string | null };

type DutySwap = {
  swap_id: string;
  assignment_id: string;
  requester_faculty_user_id: string;
  target_faculty_user_id: string;
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
  exam_date: string;
  room: string;
  session_label: string | null;
  requester_name: string;
  target_name: string;
};

function swapStatusLabel(status: DutySwap['status']) {
  switch (status) {
    case 'PENDING_TARGET':
      return 'Awaiting peer';
    case 'PENDING_EXAM_CELL':
      return 'Awaiting Exam Cell';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED_BY_TARGET':
      return 'Declined by peer';
    case 'REJECTED_BY_EXAM_CELL':
      return 'Rejected by Exam Cell';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export default function FacultyInvigilationPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [swaps, setSwaps] = useState<DutySwap[]>([]);
  const [requestingDuty, setRequestingDuty] = useState<Duty | null>(null);
  const [reason, setReason] = useState('');
  const [swappingDuty, setSwappingDuty] = useState<Duty | null>(null);
  const [partners, setPartners] = useState<SwapPartner[]>([]);
  const [targetFacultyId, setTargetFacultyId] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [respondingSwap, setRespondingSwap] = useState<DutySwap | null>(null);
  const [respondComment, setRespondComment] = useState('');

  const load = useCallback(() => {
    void api
      .get<Duty[]>('/api/academics/faculty/workspaces/invigilation')
      .then((rows) =>
        setDuties(withFacultyDemoFallback(rows, facultyDemoDuties() as Duty[], isEmptyArray)),
      )
      .catch((error) => {
        const demo = withFacultyDemoFallback([], facultyDemoDuties() as Duty[], isEmptyArray);
        if (demo.length === 0) {
          toast.error(error instanceof Error ? error.message : 'Failed to load invigilation duties');
        }
        setDuties(demo);
      });
    void api
      .get<DutySwap[]>('/api/academics/faculty/workspaces/invigilation-swaps')
      .then((rows) => setSwaps(Array.isArray(rows) ? rows : []))
      .catch(() => setSwaps([]));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitExcuse() {
    if (!requestingDuty) return;
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    try {
      if (isFacultyDemoSmokeId(requestingDuty.assignment_id)) {
        toast.success('Unavailability request submitted successfully (demo)');
        setRequestingDuty(null);
        setReason('');
        return;
      }
      await api.post(
        `/api/academics/faculty/workspaces/invigilation/${requestingDuty.assignment_id}/excuse`,
        { reason },
      );
      toast.success('Unavailability request submitted successfully');
      setRequestingDuty(null);
      setReason('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit request');
    }
  }

  async function openSwap(duty: Duty) {
    setSwappingDuty(duty);
    setTargetFacultyId('');
    setSwapReason('');
    if (isFacultyDemoSmokeId(duty.assignment_id)) {
      setPartners([]);
      toast.success('Swap partners unavailable for demo duties — use live allocations for peer swap.');
      return;
    }
    try {
      const rows = await api.get<SwapPartner[]>(
        `/api/academics/faculty/workspaces/invigilation/${duty.assignment_id}/swap-partners`,
      );
      setPartners(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setPartners([]);
      toast.error(e instanceof Error ? e.message : 'Failed to load swap partners');
    }
  }

  async function submitSwap() {
    if (!swappingDuty) return;
    if (!targetFacultyId) {
      toast.error('Select a faculty member');
      return;
    }
    if (!swapReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (isFacultyDemoSmokeId(swappingDuty.assignment_id)) {
      toast.success('Duty swap request sent to peer faculty (demo)');
      setSwappingDuty(null);
      return;
    }
    try {
      await api.post(
        `/api/academics/faculty/workspaces/invigilation/${swappingDuty.assignment_id}/swap`,
        {
          target_faculty_user_id: targetFacultyId,
          reason: swapReason.trim(),
        },
      );
      toast.success('Duty swap request sent to peer faculty');
      setSwappingDuty(null);
      setSwapReason('');
      setTargetFacultyId('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to request swap');
    }
  }

  async function respondSwap(accept: boolean) {
    if (!respondingSwap) return;
    if (isFacultyDemoSmokeId(respondingSwap.swap_id)) {
      toast.success(accept ? 'Accepted — forwarded to Exam Cell (demo)' : 'Swap declined (demo)');
      setRespondingSwap(null);
      setRespondComment('');
      return;
    }
    try {
      await api.post(
        `/api/academics/faculty/workspaces/invigilation-swaps/${respondingSwap.swap_id}/respond`,
        { accept, comment: respondComment.trim() || undefined },
      );
      toast.success(accept ? 'Accepted — forwarded to Exam Cell' : 'Swap declined');
      setRespondingSwap(null);
      setRespondComment('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to respond');
    }
  }

  async function cancelSwap(swapId: string) {
    if (isFacultyDemoSmokeId(swapId)) {
      toast.success('Swap request cancelled (demo)');
      return;
    }
    try {
      await api.post(`/api/academics/faculty/workspaces/invigilation-swaps/${swapId}/cancel`, {});
      toast.success('Swap request cancelled');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel');
    }
  }

  const openIncoming = swaps.filter(
    (s) =>
      s.status === 'PENDING_TARGET' && s.target_faculty_user_id === user?.user_id,
  );

  return (
    <FacultyPageShell className="min-w-0 overflow-x-hidden">
      <FacultyPageHeader
        title="Exam Duty"
        description="View your invigilation roster — room, block, and session details from Exam Cell. Request unavailability or propose a peer duty swap."
        meta={<FacultyMetricChip label="Duties" value={duties.length} emphasis />}
      />

      {openIncoming.length > 0 ? (
        <FacultyPanel title="Incoming swap requests" count={openIncoming.length}>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {openIncoming.map((s) => (
              <div
                key={s.swap_id}
                className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
              >
                <p className="font-semibold text-sgvu-navy">{s.requester_name} requests a swap</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(s.exam_date).toLocaleDateString('en-IN')} · Room {s.room}
                  {s.session_label ? ` · ${s.session_label}` : ''}
                </p>
                <p className="mt-2 text-sm text-sgvu-navy/80">{s.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setRespondingSwap(s)}>
                    Respond
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </FacultyPanel>
      ) : null}

      {duties.length === 0 ? (
        <FacultyEmptyState description="No invigilation duties assigned yet." />
      ) : (
        <FacultyPanel title="Your invigilation roster" count={duties.length}>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {duties.map((d) => (
              <div
                key={d.assignment_id}
                className="flex min-w-0 flex-col justify-between rounded-xl border border-border/60 bg-background p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sgvu-navy">
                          {d.session_label ?? 'Invigilation'}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {new Date(d.exam_date).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Exam Cell
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-sgvu-navy/60" />
                      Block {d.block_name ?? '—'} · Room {d.room}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t pt-3">
                  {d.excuse_status ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            d.excuse_status === 'APPROVED'
                              ? 'default'
                              : d.excuse_status === 'REJECTED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {d.excuse_status === 'PENDING'
                            ? 'Excuse Requested'
                            : d.excuse_status === 'APPROVED'
                              ? 'Excused'
                              : 'Excuse Rejected'}
                        </Badge>
                      </div>
                      {d.excuse_status === 'REJECTED' && d.exam_cell_comment ? (
                        <p className="flex items-start gap-1 rounded bg-red-50 p-2 text-xs text-red-600">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {d.exam_cell_comment}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setRequestingDuty(d)}
                      >
                        Request Unavailability
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => void openSwap(d)}
                      >
                        <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
                        Request Swap
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </FacultyPanel>
      )}

      {swaps.length > 0 ? (
        <FacultyPanel title="Swap history" count={swaps.length}>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Duty</th>
                  <th className="px-2 py-2">From → To</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {swaps.map((s) => (
                  <tr key={s.swap_id} className="border-t border-border/50">
                    <td className="px-2 py-2">
                      {String(s.exam_date).slice(0, 10)} · Room {s.room}
                    </td>
                    <td className="px-2 py-2">
                      {s.requester_name} → {s.target_name}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="secondary">{swapStatusLabel(s.status)}</Badge>
                    </td>
                    <td className="px-2 py-2">
                      {['PENDING_TARGET', 'PENDING_EXAM_CELL'].includes(s.status) &&
                      s.requester_faculty_user_id === user?.user_id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => void cancelSwap(s.swap_id)}
                        >
                          Cancel
                        </Button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FacultyPanel>
      ) : null}

      <Dialog open={!!requestingDuty} onOpenChange={(open) => !open && setRequestingDuty(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Unavailability</DialogTitle>
            <DialogDescription>
              State the reason you are unable to attend the invigilation duty for{' '}
              {requestingDuty?.session_label} in Room {requestingDuty?.room}. This request will be
              reviewed by the Exam Cell.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <textarea
                className="min-h-[100px] w-full min-w-0 rounded-md border p-3 text-sm"
                placeholder="E.g., Medical emergency, clash with another scheduled academic activity..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setRequestingDuty(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitExcuse()} disabled={!reason.trim()}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!swappingDuty} onOpenChange={(open) => !open && setSwappingDuty(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request duty swap</DialogTitle>
            <DialogDescription>
              Ask another faculty member to take your duty on{' '}
              {swappingDuty ? new Date(swappingDuty.exam_date).toLocaleDateString('en-IN') : ''} ·
              Room {swappingDuty?.room}. After they accept, Exam Cell must approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Faculty partner</label>
              <Select
                className="h-10 w-full min-w-0"
                value={targetFacultyId || undefined}
                onChange={(e) => setTargetFacultyId(e.target.value)}
              >
                <option value="">Select faculty…</option>
                {partners.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <textarea
                className="min-h-[90px] w-full min-w-0 rounded-md border p-3 text-sm"
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                placeholder="Why do you need this swap?"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setSwappingDuty(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitSwap()}
              disabled={!targetFacultyId || !swapReason.trim()}
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondingSwap} onOpenChange={(open) => !open && setRespondingSwap(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to duty swap</DialogTitle>
            <DialogDescription>
              {respondingSwap?.requester_name} wants you to cover Room {respondingSwap?.room} on{' '}
              {respondingSwap
                ? new Date(respondingSwap.exam_date).toLocaleDateString('en-IN')
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <label className="text-sm font-medium">Comment (optional)</label>
            <textarea
              className="min-h-[80px] w-full min-w-0 rounded-md border p-3 text-sm"
              value={respondComment}
              onChange={(e) => setRespondComment(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void respondSwap(false)}>
              Decline
            </Button>
            <Button onClick={() => void respondSwap(true)}>Accept &amp; send to Exam Cell</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
