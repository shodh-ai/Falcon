'use client';

export type PublishedSlot = {
  timetable_id: string; day_of_week: number; start_time: string; end_time: string;
  course_code: string; course_name: string; room: string | null; section?: string | null;
  awaiting_confirmation?: boolean;
};
export const timetableMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
export function timetableBoundaries(slots: PublishedSlot[]) {
  return [...new Set(slots.flatMap(slot => [timetableMinutes(slot.start_time), timetableMinutes(slot.end_time)]))].sort((a, b) => a - b);
}
const display = (minutes: number) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${minutes >= 720 ? 'PM' : 'AM'}`;
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Compact day columns preserve exact class times without stretching every
 * empty hour into a full-width row. Concurrent batches stay separate cards. */
export function PublishedTimetableGrid({ slots, selectedId, onSelect }: {
  slots: PublishedSlot[];
  selectedId?: string | null;
  onSelect?: (slot: PublishedSlot) => void;
}) {
  const teachingDays = days.slice(0, slots.some(slot => slot.day_of_week === 7) ? 7 : 6);
  return <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Weekly published timetable">
    {teachingDays.map((day, dayIndex) => {
      const entries = slots.filter(slot => slot.day_of_week === dayIndex + 1)
        .sort((a, b) => timetableMinutes(a.start_time) - timetableMinutes(b.start_time) || a.course_code.localeCompare(b.course_code));
      return <section key={day} aria-label={day} className="min-w-0 rounded-xl border border-sgvu-navy/10 bg-slate-50/60">
        <div className="flex items-center justify-between border-b border-sgvu-navy/10 px-3 py-2.5">
          <h3 className="text-sm font-bold text-sgvu-navy">{day}</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sgvu-navy">{entries.length}</span>
        </div>
        <div className="grid gap-2 p-2.5">
          {entries.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No classes</p>}
          {entries.map(slot => <button key={slot.timetable_id} type="button" onClick={() => onSelect?.(slot)}
            aria-pressed={selectedId === slot.timetable_id}
            aria-label={`${slot.course_code} ${slot.course_name}, ${display(timetableMinutes(slot.start_time))} to ${display(timetableMinutes(slot.end_time))}, ${slot.section || 'whole course'}`}
            className={`w-full rounded-lg border p-3 text-left shadow-sm transition-colors hover:border-sgvu-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sgvu-gold ${selectedId === slot.timetable_id ? 'border-sgvu-gold ring-2 ring-sgvu-gold/50' : 'border-sgvu-navy/10'} ${slot.awaiting_confirmation ? 'bg-amber-50' : 'bg-white'}`}>
            <p className="font-mono text-xs font-bold tabular-nums text-sgvu-navy">{display(timetableMinutes(slot.start_time))} – {display(timetableMinutes(slot.end_time))}</p>
            <p className="mt-1.5 text-sm font-bold text-sgvu-navy">{slot.course_code}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-sgvu-navy/80" title={slot.course_name}>{slot.course_name}</p>
            <p className="mt-2 text-xs text-muted-foreground">{slot.section || 'Whole course'} · {slot.room || 'Room TBA'}</p>
            {slot.awaiting_confirmation && <p className="mt-1 text-xs font-medium text-amber-900">Awaiting confirmation</p>}
          </button>)}
        </div>
      </section>;
    })}
  </div>;
}
