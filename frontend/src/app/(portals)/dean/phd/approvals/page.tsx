'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function DeanPhdApprovalsPage() {
  return (
    <PhdReviewQueue
      title="Board of Management — Ph.D. Awards"
      description="Approve Ph.D. degree award after successful viva voce."
      listPath="/api/phd-lifecycle/dean/candidates"
      role="Dean"
    />
  );
}
