'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function ResearchScholarsPage() {
  return (
    <PhdReviewQueue
      title="Ph.D. Scholar Pipeline"
      description="Overview of all Ph.D. candidates across admission, registration, progress, synopsis, thesis, viva, and award stages."
      listPath="/api/phd-lifecycle/candidates"
      role="IQAC"
    />
  );
}
