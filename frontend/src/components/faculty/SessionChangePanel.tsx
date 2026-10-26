'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
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
};
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
};
type Availability = {
  note: string;
  duration_minutes: number;
  slots: Array<{
    start_time: string;
    end_time: string;
    status: 'AVAILABLE' | 'CONFLICT' | 'REQUIRES_REVIEW';
    reasons: string[];
  }>;
};
const emptyLeg = (): Leg => ({
  timetable_id: '', source_date: '',
});
const isoDay = (value: string) => value ? (new Date(`${value}T00:00:00Z`).getUTCDay() || 7) : 0;

export function SessionChangePanel({ slots, selectedTimetableId, selectedSourceDate }: {
  slots: Slot[]; selectedTimetableId?: string; selectedSourceDate?: string;
}) {
  const api = useAuthedApi();
  const [mode, setMode] = useState<'RESCHEDULE' | 'SWAP' | 'RESHUFFLE'>(selectedTimetableId ? 'RESCHEDULE' : 'SWAP');
  const [legs, setLegs] = useState<Leg[]>([emptyLeg(), emptyLeg()]);
  const [reschedule, setReschedule] = useState({
    timetable_id: selectedTimetableId ?? '', source_date: selectedSourceDate ?? '',
    target_date: selectedSourceDate ?? '', target_room: '',
  });
  const [showAvailability, setShowAvailability] = useState(Boolean(selectedTimetableId));
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [chosenTime, setChosenTime] = useState('');
  const [reason, setReason] = useState('');
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState(false);
  const [groupPreview, setGroupPreview] = useState<{
    key: string; status: 'AVAILABLE' | 'CONFLICT' | 'REQUIRES_REVIEW';
    reasons: string[];
  } | null>(null);
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

  function updateReschedule(patch: Partial<typeof reschedule>) {
    setReschedule((current) => ({ ...current, ...patch }));
    setAvailability(null);
    setAvailabilityError(null);
    setChosenTime('');
  }

  useEffect(() => {
    if (!showAvailability || !reschedule.timetable_id || !reschedule.source_date || !reschedule.target_date) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCheckingAvailability(true);
      setAvailability(null);
      setAvailabilityError(null);
      setChosenTime('');
      const params = new URLSearchParams({
        timetable_id: reschedule.timetable_id,
        source_date: reschedule.source_date,
        target_date: reschedule.target_date,
      });
      if (reschedule.target_room.trim()) params.set('target_room', reschedule.target_room.trim());
      try {
        const result = await api.get<Availability>(`/api/academics/session-changes/availability?${params}`);
        if (!cancelled) setAvailability(result);
      } catch (error) {
        if (!cancelled) setAvailabilityError(error instanceof Error ? error.message : 'Availability could not be verified');
      } finally {
        if (!cancelled) setCheckingAvailability(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, reschedule, showAvailability]);

  async function submitReschedule() {
    const chosen = availability?.slots.find((slot) => slot.start_time === chosenTime && slot.status === 'AVAILABLE');
    if (!chosen || !reason.trim()) {
      toast.error('Choose a verified available slot and give a reason');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/academics/session-changes', {
        move_type: 'RESCHEDULE', reason: reason.trim(), legs: [{
          timetable_id: reschedule.timetable_id,
          source_date: reschedule.source_date,
          target_date: reschedule.target_date,
          target_start_time: chosen.start_time,
          target_end_time: chosen.end_time,
          target_room: reschedule.target_room.trim() || null,
        }],
      });
      toast.success('Reschedule sent for HOD approval. The slot is not reserved yet.');
      setChosenTime('');
      setReason('');
      setShowAvailability(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not propose reschedule');
    } finally { setBusy(false); }
  }

  function update(index: number, patch: Partial<Leg>) {
    setLegs((current) => current.map((leg, at) => at === index ? { ...leg, ...patch } : leg));
  }
  function buildGroup() {
    const count = mode === 'RESHUFFLE' ? 3 : 2;
    const chosen = legs.slice(0,count);
    const chosenSlots = chosen.map((leg) => slots.find((slot) => slot.timetable_id === leg.timetable_id));
    if (!chosen.every((leg) => leg.source_date) || chosenSlots.some((slot) => !slot) ||
        new Set(chosen.map((leg) => `${leg.timetable_id}|${leg.source_date}`)).size !== count) {
      return null;
    }
    const duration = (slot: Slot) => {
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      return minutes(slot.end_time) - minutes(slot.start_time);
    };
    if (new Set(chosenSlots.map((slot) => duration(slot!))).size !== 1) {
      return;
    }
    return chosen.map((leg,index) => {
      const target = chosen[(index + 1) % count];
      const targetSlot = chosenSlots[(index + 1) % count]!;
      return { timetable_id: leg.timetable_id,source_date: leg.source_date,
        target_date: target.source_date,target_start_time: targetSlot.start_time,
        target_end_time: targetSlot.end_time,target_room: targetSlot.room };
    });
  }
  const previewKey = JSON.stringify({ mode, legs });
  async function checkGroup() {
    const group = buildGroup();
    if (!group) { toast.error('Choose distinct dated classes with equal durations'); return; }
    setBusy(true);
    try {
      const result = await api.post<{ status: 'AVAILABLE' | 'CONFLICT' | 'REQUIRES_REVIEW';
        reasons: string[] }>('/api/academics/session-changes/preview',{
        move_type: mode,legs: group,
      });
      setGroupPreview({ key: previewKey,...result });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not check group availability');
    } finally { setBusy(false); }
  }
  async function submit() {
    const group = buildGroup();
    if (!group || !reason.trim()) { toast.error('Choose the dated classes and give a reason'); return; }
    if (groupPreview?.key !== previewKey || groupPreview.status !== 'AVAILABLE') {
      toast.error('Check the whole group and resolve conflicts before submitting');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/academics/session-changes', {
        move_type: mode, reason: reason.trim(), legs: group,
      });
      toast.success('Class group sent for independent HOD approval');
      setLegs(Array.from({ length: mode === 'RESHUFFLE' ? 3 : 2 },emptyLeg));
      setGroupPreview(null);
      setReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not propose class change');
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border bg-white p-4 space-y-4" aria-label="Manage dated classes">
    <div>
      <h2 className="font-semibold text-sgvu-navy">Manage dated classes</h2>
      <p className="text-sm text-muted-foreground">A proposed change needs independent HOD approval. Suggested slots are not reservations; conflicts are checked again before approval.</p>
    </div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Class-management action">
      <Button type="button" variant={mode === 'SWAP' ? 'default' : 'outline'} onClick={() => { setMode('SWAP'); setLegs([emptyLeg(),emptyLeg()]); setGroupPreview(null); }}>Swap two classes</Button>
      <Button type="button" variant={mode === 'RESHUFFLE' ? 'default' : 'outline'} onClick={() => { setMode('RESHUFFLE'); setLegs([emptyLeg(),emptyLeg(),emptyLeg()]); setGroupPreview(null); }}>Reshuffle three classes</Button>
      <Button type="button" variant={mode === 'RESCHEDULE' ? 'default' : 'outline'} onClick={() => { setMode('RESCHEDULE'); setShowAvailability(true); }}>Reschedule class</Button>
    </div>
    {mode === 'RESCHEDULE' ? <div className="space-y-3" role="tabpanel">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">Original class
          <Select value={reschedule.timetable_id} onChange={(event) => updateReschedule({ timetable_id: event.target.value })}>
            <option value="">Select class</option>
            {slots.map((slot) => <option key={slot.timetable_id} value={slot.timetable_id}>{slot.course_code} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.room || 'Room unknown'}</option>)}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">Original class date
          <Input type="date" value={reschedule.source_date} onChange={(event) => updateReschedule({ source_date: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">Proposed date
          <Input type="date" value={reschedule.target_date} onChange={(event) => updateReschedule({ target_date: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">Room or laboratory
          <Input value={reschedule.target_room} onChange={(event) => updateReschedule({ target_room: event.target.value })} placeholder="Use original room if blank" />
        </label>
      </div>
      <Button type="button" variant="outline" onClick={() => setShowAvailability((current) => !current)}>{showAvailability ? 'Hide available slots' : 'Show available slots'}</Button>
      {showAvailability && <div className="rounded-lg border bg-slate-50 p-3" aria-label="Available slots">
        <p className="text-sm font-semibold text-sgvu-navy">Available slots</p>
        <p className="text-xs text-muted-foreground">Green means verified free; amber needs data review; red is blocked. Selecting a slot never bypasses HOD approval.</p>
        {checkingAvailability && <p role="status" className="mt-2 text-sm">Checking student, faculty, room, exam and calendar availability…</p>}
        {availabilityError && <p role="alert" className="mt-2 text-sm text-amber-900">{availabilityError}</p>}
        {availability && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {availability.slots.map((slot) => <button key={slot.start_time} type="button"
            disabled={slot.status !== 'AVAILABLE'}
            onClick={() => setChosenTime(slot.start_time)}
            aria-pressed={chosenTime === slot.start_time}
            className={`rounded-lg border p-2 text-left text-sm ${slot.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50' : slot.status === 'CONFLICT' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} ${chosenTime === slot.start_time ? 'ring-2 ring-sgvu-navy' : ''}`}>
            <span className="font-semibold">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span>
            <span className="ml-2 text-xs">{slot.status === 'REQUIRES_REVIEW' ? 'Requires review' : slot.status === 'CONFLICT' ? 'Conflict' : 'Available'}</span>
            {slot.reasons.map((reason, index) => <span key={index} className="mt-1 block text-xs">{reason}</span>)}
          </button>)}
        </div>}
      </div>}
      <label className="grid gap-1 text-sm">Reason
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this class needs to move" />
      </label>
      <Button disabled={busy || !chosenTime} type="button" onClick={() => void submitReschedule()}>{busy ? 'Checking…' : 'Send for HOD approval'}</Button>
    </div> : <>
    <p className="text-sm text-muted-foreground">Choose {mode === 'RESHUFFLE' ? 'three' : 'two'} exact dated sessions of equal duration. Times and rooms rotate together only after whole-group clash checks and HOD approval. Attendance follows each class; the recurring timetable stays unchanged.</p>
    {legs.map((leg, index) => {
      const choices = slots.filter((slot) => !leg.source_date || slot.day_of_week === isoDay(leg.source_date));
      return <div key={index} className="rounded-lg border bg-slate-50/50 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <p className="sm:col-span-2 lg:col-span-3 text-sm font-semibold">Class {index + 1}</p>
        <label className="grid gap-1 text-sm">Class {index + 1} date
          <Input type="date" value={leg.source_date} onChange={(event) => update(index, { source_date: event.target.value, timetable_id: '' })} />
        </label>
        <label className="grid gap-1 text-sm">Class {index + 1} session
          <Select value={leg.timetable_id} onChange={(event) => {
            update(index, { timetable_id: event.target.value });
          }}>
            <option value="">Select the class on that day</option>
            {choices.map((slot) => <option key={slot.timetable_id} value={slot.timetable_id}>{slot.course_code} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.room || 'No room'}</option>)}
          </Select>
        </label>
      </div>;
    })}
    <label className="grid gap-1 text-sm">Reason
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this change is needed" />
    </label>
    <Button variant="outline" disabled={busy || !slots.length} type="button" onClick={() => void checkGroup()}>Check group availability</Button>
    {groupPreview?.key === previewKey && <p role="status" className={`rounded-lg border p-2 text-sm ${groupPreview.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50' : groupPreview.status === 'CONFLICT' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      {groupPreview.status === 'REQUIRES_REVIEW' ? 'Requires review' : groupPreview.status === 'CONFLICT' ? 'Conflict' : 'Available'}
      {groupPreview.reasons.map((reason) => <span key={reason} className="block">{reason}</span>)}
    </p>}
    <Button disabled={busy || !slots.length} type="button" onClick={() => void submit()}>{busy ? 'Checking…' : 'Send for HOD approval'}</Button>
    </>}
    {ordered.length > 0 && <div className="border-t pt-3 space-y-1 text-sm">
      <p className="font-semibold">My recent class changes</p>
      {ordered.slice(0, 10).map((change) => <p key={change.move_id}>{change.course_code} · {String(change.source_date).slice(0, 10)} → {String(change.target_date).slice(0, 10)} · {change.move_type} · {change.status.replaceAll('_', ' ')}</p>)}
    </div>}
  </section>;
}
