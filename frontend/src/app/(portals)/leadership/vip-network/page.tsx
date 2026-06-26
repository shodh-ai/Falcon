'use client';

import { useEffect, useState } from 'react';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { TrafficLightKpi } from '@/components/leadership/executive';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useLeadershipApi } from '@/lib/api/api.leadership';

const STAGES = ['PROSPECTED', 'PITCHED', 'PLEDGED', 'RECEIVED', 'DORMANT'];

export default function LeadershipVipNetworkPage() {
  const api = useLeadershipApi();
  const [contacts, setContacts] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void api.vipContacts().then(setContacts).catch(() => setContacts([]));
  }, [api]);

  const byStage = STAGES.map((stage) => ({
    stage,
    items: contacts.filter((c) => c.pipeline_stage === stage),
  }));

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="VIP & Fundraising"
        title="VIP Contact Book & Fundraising Pipeline"
        description="HNIs, recruiters, CSR — Prospected → Pitched → Pledged → Received"
      />

      <div className="grid gap-4 sm:grid-cols-4">
        {byStage.slice(0, 4).map((col) => (
          <TrafficLightKpi key={col.stage} label={col.stage} value={String(col.items.length)} status="green" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {byStage.map((col) => (
          <LeadershipSectionCard key={col.stage} title={col.stage.replace('_', ' ')}>
            <ul className="space-y-2 text-sm">
              {col.items.map((c) => (
                <li key={String(c.contact_id)} className="rounded-lg border px-2 py-2">
                  <p className="font-semibold">{String(c.full_name)}</p>
                  <p className="text-xs text-muted-foreground">{String(c.organization ?? c.contact_type)}</p>
                </li>
              ))}
              {col.items.length === 0 ? <li className="text-muted-foreground">Empty</li> : null}
            </ul>
          </LeadershipSectionCard>
        ))}
      </div>
    </div>
  );
}
