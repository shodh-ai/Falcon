'use client';

import { Info } from 'lucide-react';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

/** Visible when demo fallbacks may be filling empty API responses. */
export function StudentDemoModeBanner() {
  if (!isStudentDemoModeEnabled()) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-950"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
      <p>
        <span className="font-semibold">Demo mode is ON:</span> empty API responses may be filled
        with sample student records. For production / smoke with seeded data, unset{' '}
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_STUDENT_DEMO_MODE</code> and rebuild.
      </p>
    </div>
  );
}
