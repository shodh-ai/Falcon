'use client';

import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrLeaveReviewQueue } from '@/components/hr/HrLeaveReviewQueue';

export default function HrRegularizationsPage() {
  return (
    <>
      <HrPageHeader
        title="Attendance Regularizations"
        description="Review attendance corrections that are specifically awaiting your final HR sign-off."
      />
      <HrLeaveReviewQueue requestType="REGULARIZATION" />
    </>
  );
}
