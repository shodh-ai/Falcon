'use client';

import { Info } from 'lucide-react';
import { isFacultyDemoModeEnabled } from '@/lib/faculty-demo-mode';

/** Visible when Faculty demo fallbacks may fill empty API responses. */
export function FacultyDemoModeBanner() {
  if (!isFacultyDemoModeEnabled()) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-950"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
      <p>
        <span className="font-semibold">Faculty demo mode is ON:</span> empty or failed API
        responses are filled with sample faculty records for visual smoke testing. Set{' '}
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_FACULTY_DEMO_MODE=false</code> and
        restart for production / seeded data.
      </p>
    </div>
  );
}
