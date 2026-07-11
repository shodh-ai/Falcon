'use client';

import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';

export default function HodProfileCorrectionsPage() {
  return (
    <HodPageFrame>
      <HodPageHeader
        title="Student Profile Corrections"
        description="Approve or reject student requests to edit their profile. Approved requests unlock a 15-minute edit window."
      />
      <ProfileCorrectionWidget limit={100} />
    </HodPageFrame>
  );
}
