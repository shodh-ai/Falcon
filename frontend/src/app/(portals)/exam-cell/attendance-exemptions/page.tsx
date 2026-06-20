'use client';

import { ExemptionReviewQueue } from '@/components/attendance/ExemptionReviewQueue';

export default function ExamCellAttendanceExemptionsPage() {
  return (
    <ExemptionReviewQueue
      title="Attendance Exemptions — Approved"
      description="Students the HOD has approved for attendance exemption. Admit card generation is allowed for these students despite low attendance."
      listPath="/api/attendance-policy/approved/exemptions"
      decisionBasePath=""
      mode="VIEW"
    />
  );
}
