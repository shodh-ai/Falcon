'use client';

import { HodGatePassApprovalsPanel } from '@/components/hod/HodGatePassApprovalsPanel';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';

export default function HodGatePassApprovalsPage() {
  return (
    <HodPageFrame>
      <HodPageHeader
        title="Gate Pass Approvals"
        description="Review and approve mid-duty exit passes from your direct reports."
      />
      <HodGatePassApprovalsPanel />
    </HodPageFrame>
  );
}
