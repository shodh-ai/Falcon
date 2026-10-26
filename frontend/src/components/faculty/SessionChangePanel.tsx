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
const emptyLeg = (): Leg => ({
  timetable_id: '', source_date: '',
});
const isoDay = (value: string) => value ? (new Date(`${value}T00:00:00Z`).getUTCDay() || 7) : 0;

export function SessionChangePanel({ slots }: { slots: Slot[] }) {
  const api = useAuthedApi();
  const [legs, setLegs] = useState<Leg[]>([emptyLeg(), emptyLeg()]);
  const [reason, setReason] = useState('');
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState(false);
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

  function update(index: number, patch: Partial<Leg>) {
    setLegs((current) => current.map((leg, at) => at === index ? { ...leg, ...patch } : leg));
  }
  async function submit() {
    const [first, second] = legs;
    const firstSlot = slots.find((slot) => slot.timetable_id === first.timetable_id);
    const secondSlot = slots.find((slot) => slot.timetable_id === second.timetable_id);
    if (!reason.trim() || !first.source_date || !second.source_date || !firstSlot || !secondSlot) {
      toast.error('Choose two dated classes and give a reason');
      return;
    }
    if (first.timetable_id === second.timetable_id && first.source_date === second.source_date) {
      toast.error('Choose two different class sessions');
      return;
    }
    const duration = (slot: Slot) => {
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      return minutes(slot.end_time) - minutes(slot.start_time);
    };
    if (duration(firstSlot) !== duration(secondSlot)) {
      toast.error('Both classes must have the same duration for an exact swap');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/academics/session-changes', {
        move_type: 'SWAP', reason: reason.trim(), legs: [
          { timetable_id: first.timetable_id, source_date: first.source_date,
            target_date: second.source_date, target_start_time: secondSlot.start_time,
            target_end_time: secondSlot.end_time, target_room: secondSlot.room },
          { timetable_id: second.timetable_id, source_date: second.source_date,
            target_date: first.source_date, target_start_time: firstSlot.start_time,
            target_end_time: firstSlot.end_time, target_room: firstSlot.room },
        ],
      });
      toast.success('Two-class swap sent for independent HOD approval');
      setLegs([emptyLeg(), emptyLeg()]);
      setReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not propose class change');
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border bg-white p-4 space-y-4" aria-label="Swap two classes">
    <div>
      <h2 className="font-semibold text-sgvu-navy">Swap two classes</h2>
      <p className="text-sm text-muted-foreground">Choose the two exact dated sessions. Their times and rooms will exchange after independent HOD approval and clash checks. Attendance follows each class to its swapped slot; the recurring timetable stays unchanged.</p>
    </div>
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
    <Button disabled={busy || !slots.length} type="button" onClick={() => void submit()}>{busy ? 'Checking…' : 'Send for HOD approval'}</Button>
    {ordered.length > 0 && <div className="border-t pt-3 space-y-1 text-sm">
      <p className="font-semibold">My recent class changes</p>
      {ordered.slice(0, 10).map((change) => <p key={change.move_id}>{change.course_code} · {String(change.source_date).slice(0, 10)} → {String(change.target_date).slice(0, 10)} · {change.move_type} · {change.status.replaceAll('_', ' ')}</p>)}
    </div>}
  </section>;
}
