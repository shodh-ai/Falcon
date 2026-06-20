'use client';

import { SafetyConcernReviewQueue } from '@/components/safety/SafetyConcernReviewQueue';

export default function HodSafetyConcernsPage() {
  return (
    <SafetyConcernReviewQueue
      title="Safety Concerns"
      description="Ragging or harassment concerns involving students in your department."
      listPath="/api/student-safety/hod/concerns"
    />
  );
}
