/**
 * Faculty Portal demo fallbacks for visual smoke / QA.
 *
 * Local development: ON by default (so every Faculty screen can be visually smoke-tested).
 * Production builds: ALWAYS off — NEXT_PUBLIC_* is compile-time; never allow .env.local
 * demo flags to bake into a production bundle.
 * Explicit opt-in (dev/test only): NEXT_PUBLIC_FACULTY_DEMO_MODE=true|1|on
 */

export function isFacultyDemoModeEnabled(): boolean {
  // Hard stop for production / next build (NODE_ENV=production).
  if (process.env.NODE_ENV === 'production') return false;
  const flag = process.env.NEXT_PUBLIC_FACULTY_DEMO_MODE?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return process.env.NODE_ENV === 'development';
}

/**
 * Synthetic IDs from Faculty smoke factories (never exist in Postgres).
 * When these appear in the UI, skip mutating API calls — they will 500.
 */
export function isFacultyDemoEntityId(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^(course-|tt-demo-|stu-demo-|alloc-|asgn-demo-|sub-demo-|demo-sub-|fac-demo-|fac-ai-|fac-peer-|hod-demo-|exam-cell-|notif-fac-|mtg-demo-|duty-|wt-demo-|leave-demo-|proj-|guide-|reeval-|rnd-|iqac-|evt-|drive-|gc-|dofa-|tr-|tkt-|TKT-DEMO-|pay-|lb-|loan-|inc-demo-|safe-|cat-|dig-|mentor-|cert-demo-|pmtg-|pleave-|phd-|res-|adj-|exam-demo-|doc-demo-|fr-|ta-demo-|ann-|mat-|mod-|gp-demo-|swap-|ms-)/i.test(
    id,
  );
}

/** Demo mode is on AND this record is smoke data — use local handlers, do not hit the API. */
export function isFacultyDemoSmokeId(id: string | null | undefined): boolean {
  return isFacultyDemoModeEnabled() && isFacultyDemoEntityId(id);
}

/** Prefer live data; use demo only when demo mode is on AND live is missing/empty. */
export function withFacultyDemoFallback<T>(
  live: T | null | undefined,
  demo: T,
  isEmpty?: (value: T) => boolean,
): T {
  if (live != null && !(isEmpty?.(live) ?? false)) return live;
  if (isFacultyDemoModeEnabled()) return demo;
  if (live != null) return live;
  return live as T;
}

export function facultyDemoEmptyArray<T>(demo: T[]): T[] {
  return isFacultyDemoModeEnabled() ? demo : [];
}

export function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}
