'use client';

import { GradeChangeApprovalsPanel } from '@/components/dofa/GradeChangeApprovalsPanel';

export default function HodGradeChangeApprovalsPage() {
  return (
    <GradeChangeApprovalsPanel
      role="hod"
      eyebrow="HOD Workspace"
      title="Grade Change DOFA"
      description="Faculty submits → HOD approves → Exam Cell (COE) applies. You cannot approve your own request."
    />
  );
}
