'use client';

import { ZimyoComingSoon } from '@/components/zimyo/ZimyoComingSoon';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';

export default function HodReportsPage() {
  return (
    <HodPageFrame>
      <HodPageHeader
        title="Department Analytics"
        description="Cross-module trends for attendance, workload, results, and faculty operations."
      />
      <ZimyoComingSoon
        title="Department Analytics Reports"
        description="Aggregated charts will pull from syllabus coverage, result analytics, faculty workload, and HR attendance APIs. Use individual modules (Results, Workload, Zimyo Reports) for live exports today."
      />
    </HodPageFrame>
  );
}
