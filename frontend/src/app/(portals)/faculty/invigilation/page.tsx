'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, MapPin, Calendar, AlertCircle, ArrowLeftRight } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
  FacultyInlineLoading,
  FacultyErrorBanner,
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
import { FacultyAccountScope } from '@/components/faculty/FacultyAccountScope';
import { isEmptyArray, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoDuties } from '@/lib/mock/faculty-portal-demo';
import { formatCalendarDate } from '@/lib/faculty/calendar-date';

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

function blockLabel(name: string | null) {
  const value = name?.trim();
  if (!value) return '—';
  return /^block(?:\s|$)/i.test(value) ? value : `Block ${value}`;
}

export default function FacultyInvigilationPage() {
  const api = useAuthedApi();
  return <FacultyAccountScope scope={api}><FacultyInvigilationContent api={api} /></FacultyAccountScope>;
}

function FacultyInvigilationContent({ api }: { api: ReturnType<typeof useAuthedApi> }) {
  const { user } = useAuth();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [swaps, setSwaps] = useState<DutySwap[]>([]);
  const [dutiesLoading, setDutiesLoading] = useState(true);
  const [dutiesError, setDutiesError] = useState<string | null>(null);
  const [swapsLoading, setSwapsLoading] = useState(true);
  const [swapsError, setSwapsError] = useState<string | null>(null);
  const dutiesRequest = useRef(0);
  const swapsRequest = useRef(0);
  const [requestingDuty, setRequestingDuty] = useState<Duty | null>(null);
  const [reason, setReason] = useState('');
  const [swappingDuty, setSwappingDuty] = useState<Duty | null>(null);
  const [partners, setPartners] = useState<SwapPartner[]>([]);
  const [targetFacultyId, setTargetFacultyId] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [respondingSwap, setRespondingSwap] = useState<DutySwap | null>(null);
  const [respondComment, setRespondComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const mounted = useRef(true);
  const partnerRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; partnerRequest.current += 1; };
  }, []);

  const loadDuties = useCallback(async () => {
    const requestId = ++dutiesRequest.current;
    setDutiesLoading(true);
    setDutiesError(null);
    try {
      const rows = await api.get<Duty[]>('/api/academics/faculty/workspaces/invigilation');
      if (requestId !== dutiesRequest.current) return;
      setDuties(withFacultyDemoFallback(rows, facultyDemoDuties() as Duty[], isEmptyArray));
    } catch (error) {
      if (requestId !== dutiesRequest.current) return;
      const demo = withFacultyDemoFallback([], facultyDemoDuties() as Duty[], isEmptyArray);
      setDuties(demo);
      if (demo.length === 0) setDutiesError(error instanceof Error ? error.message : 'Failed to load invigilation duties');
    } finally {
      if (requestId === dutiesRequest.current) setDutiesLoading(false);
    }
  }, [api]);

  const loadSwaps = useCallback(async () => {
    const requestId = ++swapsRequest.current;
    setSwapsLoading(true);
    setSwapsError(null);
    try {
      const rows = await api.get<DutySwap[]>('/api/academics/faculty/workspaces/invigilation-swaps');
      if (requestId !== swapsRequest.current) return;
      setSwaps(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (requestId !== swapsRequest.current) return;
      setSwaps([]);
      setSwapsError(error instanceof Error ? error.message : 'Failed to load duty swaps');
    } finally {
      if (requestId === swapsRequest.current) setSwapsLoading(false);
    }
  }, [api]);

  const load = useCallback(() => { void loadDuties(); void loadSwaps(); }, [loadDuties, loadSwaps]);

  useEffect(() => {
    // Synchronize loading state while subscribing to both remote duty lists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => { dutiesRequest.current += 1; swapsRequest.current += 1; };
  }, [load]);

  const dutiesUnavailable = busy || dutiesLoading || Boolean(dutiesError);
  const swapActionsUnavailable = dutiesUnavailable || swapsLoading || Boolean(swapsError);

  async function changeDuty(send: () => Promise<unknown>, done: () => void, message: string) {
    if (mutationLock.current || !mounted.current) return;
    mutationLock.current = true;
    setBusy(true);
    try {
      await send();
      if (!mounted.current) return;
      done();
      toast.success(message);
      await Promise.all([loadDuties(), loadSwaps()]);
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : 'Could not save the duty request');
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function submitExcuse() {
    if (!requestingDuty || dutiesUnavailable || mutationLock.current) return;
    const text = reason.trim();
    if (!text) { toast.error('Please provide a reason'); return; }
    const duty = requestingDuty;
    const demo = isFacultyDemoSmokeId(duty.assignment_id);
    await changeDuty(
      () => demo ? Promise.resolve() : api.post(`/api/academics/faculty/workspaces/invigilation/${duty.assignment_id}/excuse`, { reason: text }),
      () => { setRequestingDuty(null); setReason(''); },
      `Unavailability request submitted successfully${demo ? ' (demo)' : ''}`,
    );
  }

  function closeSwap() {
    partnerRequest.current += 1;
    setSwappingDuty(null);
    setPartners([]);
    setPartnersError(null);
    setPartnersLoading(false);
  }

  async function loadPartners(duty: Duty) {
    const requestId = ++partnerRequest.current;
    setPartners([]);
    setPartnersError(null);
    setPartnersLoading(true);
    setTargetFacultyId('');
    try {
      const rows = isFacultyDemoSmokeId(duty.assignment_id) ? [] : await api.get<SwapPartner[]>(
        `/api/academics/faculty/workspaces/invigilation/${duty.assignment_id}/swap-partners`,
      );
      if (!mounted.current || requestId !== partnerRequest.current) return;
      if (!Array.isArray(rows)) throw new Error('Could not read available faculty partners');
      setPartners(rows);
    } catch (error) {
      if (mounted.current && requestId === partnerRequest.current) setPartnersError(error instanceof Error ? error.message : 'Failed to load swap partners');
    } finally {
      if (mounted.current && requestId === partnerRequest.current) setPartnersLoading(false);
    }
  }

  async function openSwap(duty: Duty) {
    if (swapActionsUnavailable || mutationLock.current) return;
    setSwappingDuty(duty);
    setSwapReason('');
    await loadPartners(duty);
  }

  async function submitSwap() {
    if (!swappingDuty || swapActionsUnavailable || mutationLock.current || partnersLoading || partnersError) return;
    if (!targetFacultyId || !partners.some((partner) => partner.user_id === targetFacultyId)) {
      toast.error('Select an available faculty member');
      return;
    }
    const text = swapReason.trim();
    if (!text) { toast.error('Please provide a reason'); return; }
    const duty = swappingDuty;
    const demo = isFacultyDemoSmokeId(duty.assignment_id);
    await changeDuty(
      () => demo ? Promise.resolve() : api.post(`/api/academics/faculty/workspaces/invigilation/${duty.assignment_id}/swap`, { target_faculty_user_id: targetFacultyId, reason: text }),
      () => { closeSwap(); setSwapReason(''); setTargetFacultyId(''); },
      `Duty swap request sent to peer faculty${demo ? ' (demo)' : ''}`,
    );
  }

  async function respondSwap(accept: boolean) {
    if (!respondingSwap || swapActionsUnavailable || mutationLock.current) return;
    const swap = respondingSwap;
    const demo = isFacultyDemoSmokeId(swap.swap_id);
    await changeDuty(
      () => demo ? Promise.resolve() : api.post(`/api/academics/faculty/workspaces/invigilation-swaps/${swap.swap_id}/respond`, { accept, comment: respondComment.trim() || undefined }),
      () => { setRespondingSwap(null); setRespondComment(''); },
      `${accept ? 'Accepted — forwarded to Exam Cell' : 'Swap declined'}${demo ? ' (demo)' : ''}`,
    );
  }

  async function cancelSwap(swapId: string) {
    if (swapActionsUnavailable || mutationLock.current) return;
    const demo = isFacultyDemoSmokeId(swapId);
    await changeDuty(
      () => demo ? Promise.resolve() : api.post(`/api/academics/faculty/workspaces/invigilation-swaps/${swapId}/cancel`, {}),
      () => {},
      `Swap request cancelled${demo ? ' (demo)' : ''}`,
    );
  }

  const openIncoming = swaps.filter(
    (s) =>
      !swapsLoading && !swapsError && s.status === 'PENDING_TARGET' && s.target_faculty_user_id === user?.user_id,
  );

  return (
    <FacultyPageShell className="min-w-0 overflow-x-hidden">
      <FacultyPageHeader
        title="Exam Duty"
        description="View your invigilation roster — room, block, and session details from Exam Cell. Request unavailability or propose a peer duty swap."
        meta={!dutiesUnavailable ? <FacultyMetricChip label="Duties" value={duties.length} emphasis /> : null}
      />

      {swapsLoading ? <FacultyInlineLoading label="Loading duty swaps…" /> : swapsError ? (
        <FacultyPanel title="Duty swaps">
          <div role="alert" className="space-y-3">
            <FacultyErrorBanner message={swapsError} />
            <Button variant="outline" onClick={() => void loadSwaps()}>Retry swaps</Button>
          </div>
        </FacultyPanel>
      ) : null}

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
                  {formatCalendarDate(s.exam_date)} · Room {s.room}
                  {s.session_label ? ` · ${s.session_label}` : ''}
                </p>
                <p className="mt-2 text-sm text-sgvu-navy/80">{s.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={swapActionsUnavailable} onClick={() => setRespondingSwap(s)}>
                    Respond
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </FacultyPanel>
      ) : null}

      {dutiesLoading ? <FacultyInlineLoading label="Loading exam duties…" /> : dutiesError ? (
        <FacultyPanel title="Your invigilation roster">
          <div role="alert" className="space-y-3">
            <FacultyErrorBanner message={dutiesError} />
            <Button variant="outline" onClick={() => void loadDuties()}>Retry duties</Button>
          </div>
        </FacultyPanel>
      ) : duties.length === 0 ? (
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
                          {formatCalendarDate(d.exam_date)}
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
                      {blockLabel(d.block_name)} · Room {d.room}
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
                        disabled={dutiesUnavailable}
                        onClick={() => { if (!mutationLock.current) setRequestingDuty(d); }}
                      >
                        Request Unavailability
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        disabled={swapActionsUnavailable}
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

      {!swapsLoading && !swapsError && swaps.length > 0 ? (
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
                      {formatCalendarDate(s.exam_date)} · Room {s.room}
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
                          disabled={swapActionsUnavailable}
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

      <Dialog open={!!requestingDuty} onOpenChange={(open) => { if (!open && !mutationLock.current) setRequestingDuty(null); }}>
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
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={busy} onClick={() => setRequestingDuty(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitExcuse()} disabled={dutiesUnavailable || !reason.trim()}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!swappingDuty} onOpenChange={(open) => { if (!open && !mutationLock.current) closeSwap(); }}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request duty swap</DialogTitle>
            <DialogDescription>
              Ask another faculty member to take your duty on{' '}
              {swappingDuty ? formatCalendarDate(swappingDuty.exam_date) : ''} ·
              Room {swappingDuty?.room}. After they accept, Exam Cell must approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Faculty partner</label>
              <Select
                className="h-10 w-full min-w-0"
                value={targetFacultyId || undefined}
                disabled={busy || partnersLoading || Boolean(partnersError)}
                onChange={(e) => setTargetFacultyId(e.target.value)}
              >
                <option value="">{partnersLoading ? 'Loading faculty…' : partnersError ? 'Unable to load faculty' : 'Select faculty…'}</option>
                {partners.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {partnersError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{partnersError}</p><Button variant="outline" disabled={busy} onClick={() => { if (swappingDuty) void loadPartners(swappingDuty); }}>Retry partners</Button></div> : !partnersLoading && partners.length === 0 ? <p className="text-sm text-muted-foreground">No eligible faculty partners are available for this duty.</p> : null}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <textarea
                className="min-h-[90px] w-full min-w-0 rounded-md border p-3 text-sm"
                value={swapReason}
                disabled={busy}
                onChange={(e) => setSwapReason(e.target.value)}
                placeholder="Why do you need this swap?"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={busy} onClick={closeSwap}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitSwap()}
              disabled={swapActionsUnavailable || partnersLoading || Boolean(partnersError) || !partners.some((partner) => partner.user_id === targetFacultyId) || !swapReason.trim()}
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondingSwap} onOpenChange={(open) => { if (!open && !mutationLock.current) setRespondingSwap(null); }}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to duty swap</DialogTitle>
            <DialogDescription>
              {respondingSwap?.requester_name} wants you to cover Room {respondingSwap?.room} on{' '}
              {respondingSwap
                ? formatCalendarDate(respondingSwap.exam_date)
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <label className="text-sm font-medium">Comment (optional)</label>
            <textarea
              className="min-h-[80px] w-full min-w-0 rounded-md border p-3 text-sm"
              value={respondComment}
              disabled={busy}
              onChange={(e) => setRespondComment(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={swapActionsUnavailable} onClick={() => void respondSwap(false)}>
              Decline
            </Button>
            <Button disabled={swapActionsUnavailable} onClick={() => void respondSwap(true)}>Accept &amp; send to Exam Cell</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
