'use client';

import { SafetyConcernReviewQueue } from '@/components/safety/SafetyConcernReviewQueue';

export default function DcSafetyConcernsPage() {
  return (
    <SafetyConcernReviewQueue
      title="Safety Concerns — Disciplinary Committee"
      description="Ragging and sexual harassment concerns routed exclusively to the Disciplinary Committee. Mark a case under review to notify the accused party (without reporter details)."
      listPath="/api/student-safety/dc/concerns"
    />
  );
}
