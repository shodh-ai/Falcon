'use client';

import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';

export default function LeadershipInfrastructurePage() {
  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader
        eyebrow="Pillar 5"
        title="Infrastructure, Assets & Hostels"
        description="High-level operational health · (screen scaffolded)"
      />

      <LeadershipSectionCard title="Hostel Occupancy Grid">
        <div className="rounded-xl border bg-white/60 p-6 text-sm text-muted-foreground">
          Coming next: live occupancy grid + asset valuation + maintenance burn rate.
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
