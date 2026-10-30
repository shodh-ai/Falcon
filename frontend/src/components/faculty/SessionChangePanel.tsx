'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

type Slot = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  section?: string | null;
};
type Candidate = Pick<Slot, 'timetable_id' | 'start_time' | 'end_time' | 'room' |
  'course_code' | 'course_name' | 'section'> & { faculty_name: string };
type Leg = {
  timetable_id: string;
  source_date: string;
};
type Change = {
  move_id: string;
  change_group_id: string;
  move_type: string;
  course_code: string;
  source_date: string;
  target_date: string;
  status: string;
  reason: string;
  original_faculty_id: string;
  requested_by_user_id: string;
  faculty_name: string;
  original_start_time: string;
  original_end_time: string;
  original_room: string | null;
  target_start_time: string;
  target_end_time: string;
  target_room: string | null;
};
const emptyLeg = (): Leg => ({
  timetable_id: '', source_date: '',
});
const isoDay = (value: string) => value ? (new Date(`${value}T00:00:00Z`).getUTCDay() || 7) : 0;

export function SessionChangePanel({ slots }: { slots: Slot[] }) {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [legs, setLegs] = useState<Leg[]>([emptyLeg(), emptyLeg()]);
  const [reason, setReason] = useState('');
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState(false);
  const [candidateResult, setCandidateResult] = useState<{
    key: string; candidates: Candidate[]; message: string | null;
  } | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const load = useCallback(async () => {
    const rows = await api.get<Change[]>('/api/academics/session-changes/mine');
    setChanges(Array.isArray(rows) ? rows : []);
  }, [api]);
  useEffect(() => {
    let cancelled = false;
    void api.get<Change[]>('/api/academics/session-changes/mine')
      .then((rows) => { if (!cancelled) setChanges(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [api]);
  const ordered = useMemo(() => [...changes].sort((a, b) => b.source_date.localeCompare(a.source_date)), [changes]);
  const groups = useMemo(() => {
    const map = new Map<string, Change[]>();
    for (const row of changes) map.set(row.change_group_id, [...(map.get(row.change_group_id) ?? []), row]);
    return [...map.entries()];
  }, [changes]);
  const offers = groups.filter(([, rows]) => rows[0]?.status === 'PENDING_FACULTY_ACCEPTANCE' &&
    rows[0]?.requested_by_user_id !== user?.user_id &&
    rows.some((row) => row.original_faculty_id === user?.user_id));
  const firstSlotId = legs[0].timetable_id;
  const firstDate = legs[0].source_date;
  const secondDate = legs[1].source_date;
  const candidateKey = `${firstSlotId}|${firstDate}|${secondDate}`;
  const readyForCandidates = Boolean(firstSlotId && firstDate && secondDate);
  const candidates = readyForCandidates && candidateResult?.key === candidateKey
    ? candidateResult.candidates : [];
  const candidateMessage = readyForCandidates && candidateResult?.key === candidateKey
    ? candidateResult.message : null;
  const loadingCandidates = readyForCandidates && candidateResult?.key !== candidateKey;
  useEffect(() => {
    if (!firstSlotId || !firstDate || !secondDate) return;
    let cancelled = false;
    void api.get<{ candidates: Candidate[]; message: string | null }>(
      `/api/academics/session-changes/swap-candidates?source_timetable_id=${encodeURIComponent(firstSlotId)}` +
      `&source_date=${encodeURIComponent(firstDate)}&other_date=${encodeURIComponent(secondDate)}`,
    ).then((result) => {
      if (!cancelled) setCandidateResult({ key: candidateKey, candidates: result.candidates,
        message: result.message });
    }).catch((error) => {
      if (!cancelled) setCandidateResult({ key: candidateKey, candidates: [],
        message: error instanceof Error ? error.message : 'Could not check matching classes' });
    });
    return () => { cancelled = true; };
  }, [api, candidateKey, firstSlotId, firstDate, secondDate]);

  async function respond(groupId: string, action: 'ACCEPT' | 'DECLINE') {
    setResponding(groupId);
    try {
      await api.patch(`/api/academics/session-changes/swap/${groupId}/respond`, { action });
      toast.success(action === 'ACCEPT' ? 'Swap accepted; waiting for HOD approval' : 'Swap declined');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not respond to swap');
    } finally { setResponding(null); }
  }

  function update(index: number, patch: Partial<Leg>) {
    setLegs((current) => current.map((leg, at) => {
      if (at === index) return { ...leg, ...patch };
      if (index === 0 && at === 1) return { ...leg, timetable_id: '' };
      return leg;
    }));
  }
  async function submit() {
    const [first, second] = legs;
    const firstSlot = slots.find((slot) => slot.timetable_id === first.timetable_id);
    const secondSlot = candidates.find((slot) => slot.timetable_id === second.timetable_id);
    if (!reason.trim() || !first.source_date || !second.source_date || !firstSlot || !secondSlot) {
      toast.error('Choose two dated classes and give a reason');
      return;
    }
    if (first.timetable_id === second.timetable_id && first.source_date === second.source_date) {
      toast.error('Choose two different class sessions');
      return;
    }
    const duration = (slot: Pick<Slot, 'start_time' | 'end_time'>) => {
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      return minutes(slot.end_time) - minutes(slot.start_time);
    };
    if (duration(firstSlot) !== duration(secondSlot)) {
      toast.error('Both classes must have the same duration for an exact swap');
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ status: string }>('/api/academics/session-changes', {
        move_type: 'SWAP', reason: reason.trim(), legs: [
          { timetable_id: first.timetable_id, source_date: first.source_date,
            target_date: second.source_date, target_start_time: secondSlot.start_time,
            target_end_time: secondSlot.end_time, target_room: secondSlot.room },
          { timetable_id: second.timetable_id, source_date: second.source_date,
            target_date: first.source_date, target_start_time: firstSlot.start_time,
            target_end_time: firstSlot.end_time, target_room: firstSlot.room },
        ],
      });
      toast.success(result.status === 'PENDING_FACULTY_ACCEPTANCE'
        ? 'Swap sent to the other faculty for acceptance' : 'Swap sent for HOD approval');
      setLegs([emptyLeg(), emptyLeg()]);
      setReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not propose class change');
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border bg-white p-4 space-y-4" aria-label="Swap two classes">
    <div>
      <h2 className="text-lg font-bold text-sgvu-navy">Swap two classes</h2>
      <p className="mt-1 text-sm text-muted-foreground">Exchange two dated classes in the same programme and semester, even when different faculty teach them. Student group and room clashes are checked. The other faculty accepts, then the HOD approves. The weekly timetable stays unchanged.</p>
    </div>
    {offers.length > 0 && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Swaps awaiting your response">
      <h3 className="font-semibold text-amber-950">Swaps needing your response</h3>
      {offers.map(([id, rows]) => <div key={id} className="rounded-lg bg-white p-3 text-sm">
        <p className="font-medium text-sgvu-navy">Review this two-class exchange</p>
        {rows.map((row) => <p key={row.move_id} className="mt-1">
          {row.course_code} · {row.faculty_name} · {String(row.source_date).slice(0, 10)} {row.original_start_time.slice(0, 5)}–{row.original_end_time.slice(0, 5)}
          {' → '}{String(row.target_date).slice(0, 10)} {row.target_start_time.slice(0, 5)}–{row.target_end_time.slice(0, 5)}
        </p>)}
        <p className="mt-1 text-muted-foreground">Reason: {rows[0].reason}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={responding === id} onClick={() => void respond(id, 'ACCEPT')}>Accept swap</Button>
          <Button size="sm" variant="outline" disabled={responding === id} onClick={() => void respond(id, 'DECLINE')}>Decline</Button>
        </div>
      </div>)}
    </div>}
    {legs.map((leg, index) => {
      const choices = index === 0
        ? slots.filter((slot) => leg.source_date && slot.day_of_week === isoDay(leg.source_date) && /^[0-9a-f]{8}-/i.test(slot.timetable_id))
        : candidates;
      const selected = choices.find((slot) => slot.timetable_id === leg.timetable_id);
      return <div key={index} className="rounded-xl border bg-slate-50 p-4 grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm font-semibold text-sgvu-navy">{index === 0 ? '1. Your class' : '2. Matching class to exchange'}</p>
        <label className="grid gap-1 text-sm">{index === 0 ? 'Your class date' : 'Other class date'}
          <Input type="date" value={leg.source_date} onChange={(event) => update(index, { source_date: event.target.value, timetable_id: '' })} />
        </label>
        {index === 0 ? <label className="grid gap-1 text-sm">Your class on that date
          <Select value={leg.timetable_id} onChange={(event) => update(index, { timetable_id: event.target.value })}
            disabled={!leg.source_date}>
            <option value="">Select your class</option>
            {choices.map((slot) => <option key={slot.timetable_id} value={slot.timetable_id}>
              {slot.course_code} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.room || 'No room'}
            </option>)}
          </Select>
        </label> : <div className="sm:col-span-2 space-y-2" role="group" aria-label="Matching classes to exchange">
          <p className="text-sm font-medium">Choose a matching class</p>
          <p className="text-xs text-muted-foreground">Faculty, student and room clashes are checked when you send the request and again before HOD approval.</p>
          {loadingCandidates && <p role="status" className="text-sm text-muted-foreground">Checking classes in the same programme and semester…</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {candidates.map((slot) => <button key={slot.timetable_id} type="button"
              aria-pressed={leg.timetable_id === slot.timetable_id}
              onClick={() => update(index, { timetable_id: slot.timetable_id })}
              className={`rounded-lg border p-3 text-left text-sm transition-colors hover:border-sgvu-navy ${leg.timetable_id === slot.timetable_id ? 'border-sgvu-navy bg-blue-50 ring-1 ring-sgvu-navy' : 'bg-white'}`}>
              <span className="block font-semibold text-sgvu-navy">{slot.course_code} · {slot.course_name}</span>
              <span className="mt-1 block">{slot.faculty_name}</span>
              <span className="block text-muted-foreground">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.room || 'No room'} · {slot.section || 'Whole course'}</span>
            </button>)}
          </div>
        </div>}
        {selected && <p className="sm:col-span-2 rounded-lg bg-white p-3 text-sm">
          <span className="font-semibold">{selected.course_name}</span> · {selected.start_time.slice(0, 5)}–{selected.end_time.slice(0, 5)} · {selected.room || 'No room'} · {selected.section || 'Whole course'}
          {'faculty_name' in selected ? ` · ${selected.faculty_name}` : ''}
        </p>}
        {index === 1 && candidateMessage && <p role="status" className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{candidateMessage}</p>}
      </div>;
    })}
    {legs[0].timetable_id && legs[1].timetable_id && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm" aria-label="Swap preview">
      <p className="font-semibold text-sgvu-navy">Preview: the two classes exchange time and room</p>
      <p className="mt-1">{slots.find((slot) => slot.timetable_id === legs[0].timetable_id)?.course_code} moves to {legs[1].source_date} at {candidates.find((slot) => slot.timetable_id === legs[1].timetable_id)?.start_time.slice(0, 5)}.</p>
      <p>{candidates.find((slot) => slot.timetable_id === legs[1].timetable_id)?.course_code} moves to {legs[0].source_date} at {slots.find((slot) => slot.timetable_id === legs[0].timetable_id)?.start_time.slice(0, 5)}.</p>
      <p className="mt-1 text-muted-foreground">This is a request; attendance follows each class only after approval.</p>
    </div>}
    <label className="grid gap-1 text-sm">Reason
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this change is needed" />
    </label>
    <Button disabled={busy || !legs[0].timetable_id || !legs[1].timetable_id || !reason.trim()} type="button" onClick={() => void submit()}>{busy ? 'Checking…' : 'Request swap'}</Button>
    {ordered.length > 0 && <div className="border-t pt-3 space-y-1 text-sm">
      <p className="font-semibold">My recent class changes</p>
      {groups.slice(0, 8).map(([id, rows]) => <p key={id}>{rows.map((row) => `${row.course_code} ${String(row.source_date).slice(0, 10)}`).join(' ↔ ')} · {rows[0].status.replaceAll('_', ' ')}</p>)}
    </div>}
  </section>;
}
