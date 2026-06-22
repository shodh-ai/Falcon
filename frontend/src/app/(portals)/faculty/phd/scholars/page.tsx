'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function FacultyPhdScholarsPage() {
  return (
    <PhdReviewQueue
      title="My Ph.D. Scholars"
      description="Verify guide acceptance and support scholars through the research lifecycle."
      listPath="/api/phd-lifecycle/guide/scholars"
      role="Faculty"
    />
  );
}
