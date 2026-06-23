'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function RacReviewsPage() {
  return (
    <PhdReviewQueue
      title="RAC — Research Advisory Committee"
      description="Guide allocation, eligibility, coursework, progress reports, and synopsis recommendations."
      listPath="/api/phd-lifecycle/rac/candidates"
      role="RAC_MEMBER"
    />
  );
}
