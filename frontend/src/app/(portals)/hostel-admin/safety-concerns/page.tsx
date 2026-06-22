'use client';

import { SafetyConcernReviewQueue } from '@/components/safety/SafetyConcernReviewQueue';

export default function WardenSafetyConcernsPage() {
  return (
    <SafetyConcernReviewQueue
      title="Safety Concerns — Hostel"
      description="Ragging or harassment concerns related to hostel premises."
      listPath="/api/student-safety/warden/concerns"
    />
  );
}
