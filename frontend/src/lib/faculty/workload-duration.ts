/** Convert decimal hours to clock duration, rounding floating-point noise to a minute. */
export function formatTeachingDuration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return '—';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
