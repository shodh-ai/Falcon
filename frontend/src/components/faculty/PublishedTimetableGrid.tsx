'use client';

export type PublishedSlot = {
  timetable_id: string; day_of_week: number; start_time: string; end_time: string;
  course_code: string; course_name: string; room: string | null; section?: string | null;
  awaiting_confirmation?: boolean;
  session_date?: string;
};
export const timetableMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
export function timetableBoundaries(slots: PublishedSlot[]) {
  return [...new Set(slots.flatMap(slot => [timetableMinutes(slot.start_time), timetableMinutes(slot.end_time)]))].sort((a, b) => a - b);
}
const display = (minutes: number) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${minutes >= 720 ? 'PM' : 'AM'}`;
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Actual minute boundaries, not rounded hours or a hard-coded lunch overlay. */
export function PublishedTimetableGrid({ slots, selectedId, onSelectSlot }: {
  slots: PublishedSlot[];
  selectedId?: string;
  onSelectSlot?: (slot: PublishedSlot) => void;
}) {
  const boundaries = timetableBoundaries(slots);
  const teachingDays = days.slice(0, slots.some(slot => slot.day_of_week === 7) ? 7 : 6);
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1000px] table-fixed border-collapse text-xs">
      <thead><tr className="bg-muted/30"><th className="w-32 p-3 text-left">Exact time</th>{teachingDays.map(day => <th className="p-3" key={day}>{day}</th>)}</tr></thead>
      <tbody>{boundaries.slice(0, -1).map((start, index) => {
        const end = boundaries[index + 1];
        return <tr key={start} className="border-t" style={{ height: Math.max(48, (end - start) * 1.2) }}>
          <th className="border-r p-2 align-top font-medium tabular-nums">{display(start)}<span className="block text-muted-foreground">– {display(end)}</span></th>
          {teachingDays.map((day, dayIndex) => {
            const active = slots.filter(slot => slot.day_of_week === dayIndex + 1 && timetableMinutes(slot.start_time) <= start && timetableMinutes(slot.end_time) > start);
            // A non-overlapping session occupies its full exact duration. Concurrent
            // sessions remain separate cards rather than overwriting one another.
            const previous = index > 0 && active.length === 1 && timetableMinutes(active[0].start_time) < start;
            if (previous && !slots.some(slot => slot !== active[0] && slot.day_of_week === dayIndex + 1 && timetableMinutes(slot.start_time) < timetableMinutes(active[0].end_time) && timetableMinutes(slot.end_time) > timetableMinutes(active[0].start_time))) return null;
            const single = active.length === 1 && !slots.some(slot => slot !== active[0] && slot.day_of_week === dayIndex + 1 && timetableMinutes(slot.start_time) < timetableMinutes(active[0].end_time) && timetableMinutes(slot.end_time) > timetableMinutes(active[0].start_time));
            const span = single ? boundaries.indexOf(timetableMinutes(active[0].end_time)) - index : 1;
            return <td key={day} rowSpan={span} className="border-r p-1.5 align-top">
              {active.map(slot => <button key={`${slot.timetable_id}-${slot.session_date ?? slot.start_time}`} type="button"
                onClick={() => onSelectSlot?.(slot)}
                aria-pressed={selectedId === slot.timetable_id}
                className={`mb-1 h-full w-full rounded-lg border-l-4 p-2.5 text-left ${selectedId === slot.timetable_id ? 'ring-2 ring-sgvu-gold' : ''} ${slot.awaiting_confirmation ? 'border-amber-500 bg-amber-50 text-amber-950' : 'border-sgvu-gold bg-sgvu-navy text-white'}`}>
                <p className="font-bold">{slot.course_code}</p><p className="mt-1 leading-relaxed">{slot.course_name}</p>
                <p className="mt-2 font-semibold tabular-nums">{display(timetableMinutes(slot.start_time))} – {display(timetableMinutes(slot.end_time))}</p>
                <p className="mt-1 opacity-80">{slot.section || 'Whole course'} · {slot.room || 'Room not specified'}</p>
                <p className="mt-1 opacity-80">{/(P|LAB)$/i.test(slot.course_code) ? 'Practical' : 'Class'} · {slot.awaiting_confirmation ? 'Awaiting department confirmation' : 'Published'}</p>
              </button>)}
            </td>;
          })}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
