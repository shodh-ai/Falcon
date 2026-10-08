'use client';

import { ExemptionReviewQueue } from '@/components/attendance/ExemptionReviewQueue';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { Card, CardContent } from '@/components/ui/card';

export default function ExamCellAttendanceExemptionsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="attendance-exemptions" />
        </CardContent>
      </Card>
      <ExemptionReviewQueue
        listPath="/api/attendance-policy/approved/exemptions"
        decisionBasePath=""
        mode="VIEW"
      />
    </div>
  );
}
