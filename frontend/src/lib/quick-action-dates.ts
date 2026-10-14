/** Calendar-day guidance only; HR policy may exclude holidays or adjust half-days. */
export function inclusiveCalendarDays(start: string, end: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null;
  if (new Date(first).toISOString().slice(0, 10) !== start || new Date(last).toISOString().slice(0, 10) !== end) return null;
  return Math.round((last - first) / 86_400_000) + 1;
}

/** Elapsed minutes for a same-day meeting or OD time range. */
export function timeRangeMinutes(start: string, end: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return null;
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const minutes = endHour * 60 + endMinute - startHour * 60 - startMinute;
  return minutes > 0 ? minutes : null;
}
