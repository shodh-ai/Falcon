/**
 * Student Portal demo fallbacks.
 *
 * Production-ready default: OFF.
 * Opt in explicitly with NEXT_PUBLIC_STUDENT_DEMO_MODE=true|1|on
 * (e.g. local smoke demos without seeded university data).
 */

export function isStudentDemoModeEnabled(): boolean {
  // Never bake student demo into production clients.
  if (process.env.NODE_ENV === 'production') return false;
  const flag = process.env.NEXT_PUBLIC_STUDENT_DEMO_MODE?.trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return false;
}

/** Use demo payload only when demo mode is on AND live data is missing/empty. */
export function withStudentDemoFallback<T>(
  live: T | null | undefined,
  demo: T,
  isEmpty?: (value: T) => boolean,
): T {
  if (live != null && !(isEmpty?.(live) ?? false)) return live;
  if (isStudentDemoModeEnabled()) return demo;
  if (live != null) return live;
  return live as T;
}

export function studentDemoEmptyArray<T>(demo: T[]): T[] {
  return isStudentDemoModeEnabled() ? demo : [];
}
