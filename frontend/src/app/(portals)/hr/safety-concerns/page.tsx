'use client';

import { SafetyConcernReviewQueue } from '@/components/safety/SafetyConcernReviewQueue';

export default function HrSafetyConcernsPage() {
  return (
    <SafetyConcernReviewQueue
      title="Safety Concerns — HR / ICC"
      description="Sexual harassment concerns routed to HR for ICC-aligned review."
      listPath="/api/student-safety/hr/concerns"
    />
  );
}
