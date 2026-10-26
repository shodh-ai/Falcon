'use client';

export type PublishedSlot = {
  timetable_id: string; day_of_week: number; start_time: string; end_time: string;
  course_code: string; course_name: string; room: string | null; section?: string | null;
  awaiting_confirmation?: boolean;
  display_status?: 'CLASS' | 'PRACTICAL' | 'EXTRA_CLASS' | 'CANCELLED' | 'RESCHEDULED';
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
const slotStyle = {
  CLASS: 'border-blue-200 bg-blue-50 text-blue-950',
  PRACTICAL: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  EXTRA_CLASS: 'border-amber-300 bg-amber-50 text-amber-950',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-900 opacity-80',
  RESCHEDULED: 'border-violet-200 bg-violet-50 text-violet-950',
} as const;
export function publishedSlotStatus(slot: PublishedSlot): keyof typeof slotStyle {
  if (slot.display_status) return slot.display_status;
  return /practical|laboratory|\blab\b/i.test(slot.course_name) || /(P|LAB)$/i.test(slot.course_code) ? 'PRACTICAL' : 'CLASS';
}

/** One shared time axis keeps every day's classes aligned without changing the source timetable. */
export function PublishedTimetableGrid({ slots, selectedId, onSelect, weekStart }: {
  slots: PublishedSlot[];
  selectedId?: string | null;
  onSelect?: (slot: PublishedSlot) => void;
  weekStart?: Date;
}) {
  const first = Math.min(480, ...slots.map(slot => timetableMinutes(slot.start_time)));
  const last = Math.max(1020, ...slots.map(slot => timetableMinutes(slot.end_time)));
  const start = Math.floor(first / 60) * 60;
  const end = Math.ceil(last / 60) * 60;
  const height = Math.max(1, (end - start) / 60) * 76;
  const teachingDays = days.slice(0, slots.some(slot => slot.day_of_week === 7) ? 7 : 6);
  const rows = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  return <div className="overflow-x-auto" aria-label="Weekly published timetable">
    <div className="min-w-[830px] p-3">
      <div className="mb-3 flex flex-wrap gap-2 text-xs" aria-label="Class colour key">
        {(['CLASS', 'PRACTICAL', 'EXTRA_CLASS', 'CANCELLED', 'RESCHEDULED'] as const).map(status =>
          <span key={status} className={`rounded-md border px-2 py-1 font-semibold ${slotStyle[status]}`}>{status.replace('_', ' ').toLowerCase()}</span>)}
      </div>
      <div className="grid border-l border-t border-slate-200 text-xs" style={{ gridTemplateColumns: `64px repeat(${teachingDays.length}, minmax(0, 1fr))` }}>
        <div className="border-b border-r border-slate-200 bg-slate-50 p-2 font-semibold">Time</div>
        {teachingDays.map((day, index) => {
          const date = weekStart ? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index) : null;
          return <div key={day} className="border-b border-r border-slate-200 bg-slate-50 p-2 text-center font-bold text-sgvu-navy">{day}{date && <span className="ml-1 font-normal text-slate-500">{date.getDate()}</span>}</div>;
        })}
        <div className="relative border-r border-slate-200 bg-slate-50" style={{ height }}>
          {rows.slice(0, -1).map((minute, index) => <div key={minute} className="absolute inset-x-0 border-b border-slate-200 px-1.5 pt-1 text-[10px] tabular-nums text-slate-500" style={{ top: index * 76, height: 76 }}>{display(minute)}</div>)}
        </div>
        {teachingDays.map((day, index) => {
          const entries = slots.filter(slot => slot.day_of_week === index + 1)
            .sort((a, b) => timetableMinutes(a.start_time) - timetableMinutes(b.start_time) || a.course_code.localeCompare(b.course_code));
          return <section key={day} aria-label={days[index]} className="relative border-r border-slate-200" style={{ height }}>
            {rows.slice(1, -1).map((minute, i) => <div key={minute} className="absolute inset-x-0 border-t border-slate-100" style={{ top: (i + 1) * 76 }} />)}
            {entries.map((slot, slotIndex) => {
              const from = timetableMinutes(slot.start_time);
              const to = timetableMinutes(slot.end_time);
              // Simultaneous practical batches retain individual cards in the same time block.
              const peers = entries.filter(other => timetableMinutes(other.start_time) < to && timetableMinutes(other.end_time) > from);
              const peerIndex = peers.findIndex(other => other.timetable_id === slot.timetable_id);
              const status = publishedSlotStatus(slot);
              return <button key={`${slot.timetable_id}-${slotIndex}`} type="button" onClick={() => onSelect?.(slot)}
                aria-pressed={selectedId === slot.timetable_id}
                aria-label={`${slot.course_code} ${slot.course_name}, ${display(from)} to ${display(to)}, ${slot.section || 'whole course'}${status === 'CANCELLED' ? ', cancelled' : ''}`}
                className={`absolute z-10 overflow-hidden rounded-md border p-1.5 text-left shadow-sm transition-shadow hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sgvu-gold ${slotStyle[status]} ${selectedId === slot.timetable_id ? 'ring-2 ring-sgvu-gold' : ''}`}
                style={{ top: (from - start) / 60 * 76 + 2, height: Math.max(38, (to - from) / 60 * 76 - 4), left: `calc(${peerIndex / peers.length * 100}% + 2px)`, width: `calc(${100 / peers.length}% - 4px)` }}>
                <span className="block truncate font-bold">{status === 'CANCELLED' ? 'Cancelled · ' : status === 'EXTRA_CLASS' ? 'Extra · ' : ''}{slot.course_code}</span>
                <span className="block truncate text-[10px]" title={slot.course_name}>{slot.course_name}</span>
                <span className="block text-[10px] font-semibold tabular-nums">{display(from)} – {display(to)}</span>
                <span className="block truncate text-[10px]">{slot.section || 'Whole course'} · {slot.room || 'Room TBA'}</span>
                {slot.awaiting_confirmation && <span className="block text-[10px]">Awaiting confirmation</span>}
              </button>;
            })}
          </section>;
        })}
      </div>
    </div>
  </div>;
}
