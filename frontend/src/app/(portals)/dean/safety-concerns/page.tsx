'use client';

import { SafetyConcernReviewQueue } from '@/components/safety/SafetyConcernReviewQueue';

export default function DeanSafetyConcernsPage() {
  return (
    <SafetyConcernReviewQueue
      title="Safety Concerns — Dean"
      description="Sexual harassment concerns and escalated cases requiring school-level oversight."
      listPath="/api/student-safety/dean/concerns"
    />
  );
}
