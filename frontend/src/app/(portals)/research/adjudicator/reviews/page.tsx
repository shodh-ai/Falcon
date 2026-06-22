'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function AdjudicatorReviewsPage() {
  return (
    <PhdReviewQueue
      title="Adjudicator Reviews"
      description="Accept synopsis submissions and evaluate thesis for Ph.D. candidates."
      listPath="/api/phd-lifecycle/adjudicator/candidates"
      role="PHD_ADJUDICATOR"
    />
  );
}
