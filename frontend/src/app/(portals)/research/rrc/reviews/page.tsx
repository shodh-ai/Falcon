'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function RrcReviewsPage() {
  return (
    <PhdReviewQueue
      title="RRC — Research Review Committee"
      description="Synopsis and thesis format review, pre-viva, and viva voce coordination."
      listPath="/api/phd-lifecycle/rrc/candidates"
      role="RRC_MEMBER"
    />
  );
}
