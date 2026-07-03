'use client';

import { ZimyoComingSoon } from '@/components/zimyo/ZimyoComingSoon';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';

export default function HodIqacPage() {
  return (
    <HodPageFrame>
      <HodPageHeader
        title="IQAC Submission Portal"
        description="NAAC / NIRF criterion compilation and evidence uploads for your department."
      />
      <ZimyoComingSoon
        title="IQAC Submission Portal"
        description="Department-wise criterion tracking, evidence uploads, and compiler workflows will connect to the central IQAC module in the next release."
      />
    </HodPageFrame>
  );
}
