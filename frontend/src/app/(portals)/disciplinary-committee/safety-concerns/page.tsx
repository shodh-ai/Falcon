'use client';

import { SafetyConcernReviewQueue } from '@/components/safety/SafetyConcernReviewQueue';

export default function DcSafetyConcernsPage() {
  return (
    <SafetyConcernReviewQueue
      title="Safety Concerns — Disciplinary Committee"
      description="Ragging and sexual harassment concerns routed to the DC. Review, escalate, or resolve. Faculty accused are notified separately without reporter identity."
      listPath="/api/student-safety/dc/concerns"
    />
  );
}
