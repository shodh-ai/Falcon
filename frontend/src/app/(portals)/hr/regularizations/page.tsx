'use client';

import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrLeaveReviewQueue } from '@/components/hr/HrLeaveReviewQueue';

export default function HrRegularizationsPage() {
  return (
    <>
      <HrPageHeader
        title="Attendance Regularizations"
        description="Track pending attendance corrections at both stages. Final HR actions become available only after first-level approval."
      />
      <HrLeaveReviewQueue requestType="REGULARIZATION" />
    </>
  );
}
