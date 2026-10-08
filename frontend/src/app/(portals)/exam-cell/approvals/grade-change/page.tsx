'use client';

import { GradeChangeApprovalsPanel } from '@/components/dofa/GradeChangeApprovalsPanel';

export default function ExamCellGradeChangeApprovalsPage() {
  return (
    <GradeChangeApprovalsPanel
      role="exam-cell"
      eyebrow="Exam Cell"
      title="Grade Change DOFA"
      description="Faculty submits → HOD approves → Exam Cell (COE) applies. Apply only after HOD approval."
    />
  );
}
