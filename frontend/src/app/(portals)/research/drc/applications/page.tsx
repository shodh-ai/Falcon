'use client';

import { PhdReviewQueue } from '@/components/phd/PhdReviewQueue';

export default function DrcApplicationsPage() {
  return (
    <PhdReviewQueue
      title="DRC — Ph.D. Applications"
      description="Scrutinize applications, PET results, DRC interviews, and supervisor allocation."
      listPath="/api/phd-lifecycle/drc/candidates"
      role="DRC_MEMBER"
    />
  );
}
