'use client';

import { ExemptionReviewQueue } from '@/components/attendance/ExemptionReviewQueue';

export default function ExamCellAttendanceExemptionsPage() {
  return (
    <ExemptionReviewQueue
      title="Attendance Exemption — Final Approval"
      description="HOD-recommended exemptions awaiting final sign-off. Approving unlocks the student's admit card despite low attendance."
      listPath="/api/attendance-policy/final/exemptions"
      decisionBasePath="/api/attendance-policy/final/exemptions"
      mode="FINAL"
    />
  );
}
