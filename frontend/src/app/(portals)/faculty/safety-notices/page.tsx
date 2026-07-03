'use client';

import { SafetyNoticesPanel } from '@/components/safety/SafetyNoticesPanel';

export default function FacultySafetyNoticesPage() {
  return (
    <SafetyNoticesPanel
      title="Safety Notices"
      description="Official notices when a student safety concern involving you is under review or has been closed by the Disciplinary Committee. You are notified only after the case is marked under review. Do not contact any student about these matters."
    />
  );
}
