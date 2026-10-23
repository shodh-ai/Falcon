const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_ISO_DATE = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Calendar dates are not instants. Legacy ISO values retain their written date. */
export function calendarDateKey(value: string): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!DATE_ONLY.test(text) && (!LEGACY_ISO_DATE.test(text) || !Number.isFinite(Date.parse(text)))) return null;
  const key = text.slice(0, 10);
  const date = new Date(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
  return key;
}

export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  const key = calendarDateKey(value);
  if (!key) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' })
    .format(new Date(`${key}T00:00:00.000Z`));
}

export function localTodayKey(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid calendar date');
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
