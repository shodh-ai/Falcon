'use client';

import { ExemptionReviewQueue } from '@/components/attendance/ExemptionReviewQueue';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

export default function ExamCellAttendanceExemptionsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="attendance-exemptions" />
      <ExemptionReviewQueue
        title="Attendance Exemptions — Approved"
        description="Students the HOD has approved for attendance exemption. Admit card generation is allowed for these students despite low attendance."
        listPath="/api/attendance-policy/approved/exemptions"
        decisionBasePath=""
        mode="VIEW"
      />
    </div>
  );
}
