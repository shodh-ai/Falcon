'use client';

import { ExemptionReviewQueue } from '@/components/attendance/ExemptionReviewQueue';

export default function HodAttendanceExemptionsPage() {
  return (
    <ExemptionReviewQueue
      title="Attendance Exemptions"
      description="Review students requesting attendance exemptions (medical, accident, internship). Approve or reject — approved students can generate their admit card."
      listPath="/api/attendance-policy/hod/exemptions"
      decisionBasePath="/api/attendance-policy/hod/exemptions"
      mode="HOD"
    />
  );
}
