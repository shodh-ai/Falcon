'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExecutiveActionInbox,
  ExecutiveFeatureGrid,
  ExecutiveHeroKpi,
  EXECUTIVE_SPACING,
} from '@/components/leadership/executive';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

export default function LeadershipActionCenterPage() {
  const api = useLeadershipApi();
  const [actionSummary, setActionSummary] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api.actionSummary().then(setActionSummary).catch(() => setActionSummary(null));
  }, [api]);

  const inboxPreview = useMemo(
    () =>
      ((actionSummary?.inbox_preview as Array<Record<string, unknown>>) ?? []).map((item) => ({
        id: String(item.id),
        category: String(item.category),
        title: String(item.title),
        subtype: item.subtype != null ? String(item.subtype) : undefined,
        amount: item.amount != null ? Number(item.amount) : undefined,
      })),
    [actionSummary],
  );

  const actionHub = getLeadershipHubRoutes('approvals');

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Executive Action & Control"
        title="Action Center"
        description="Command hub for approvals, tasks, memos, broadcasts, and strategic tools"
        action={
          <Link
            href="/leadership/approvals"
            className="rounded-xl border border-sgvu-navy/15 px-4 py-2 text-xs font-semibold text-sgvu-navy hover:border-sgvu-gold"
          >
            Full approvals inbox →
          </Link>
        }
      />

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <ExecutiveHeroKpi
          label="Pending Approvals"
          value={String(actionSummary?.pending_approvals ?? inboxPreview.length ?? '0')}
          status={Number(actionSummary?.pending_approvals ?? 0) > 0 ? 'yellow' : 'green'}
        />
        <ExecutiveHeroKpi
          label="Open Tasks"
          value={String(actionSummary?.open_tasks ?? '0')}
          status={Number(actionSummary?.open_tasks ?? 0) > 5 ? 'yellow' : 'green'}
        />
        <ExecutiveHeroKpi
          label="Compliance Due (14d)"
          value={String(actionSummary?.compliance_due_14d ?? '0')}
          status={Number(actionSummary?.compliance_due_14d ?? 0) > 0 ? 'red' : 'green'}
        />
        <ExecutiveHeroKpi
          label="Fundraising Leads"
          value={String(actionSummary?.active_fundraising_leads ?? '0')}
          status="neutral"
          sub={`${actionSummary?.mou_expiring_30d ?? 0} MoUs expiring in 30 days`}
        />
      </div>

      <ExecutiveActionInbox
        items={inboxPreview}
        compact
        onReviewed={() => {
          void api.actionSummary().then(setActionSummary).catch(() => setActionSummary(null));
        }}
      />

      <ExecutiveFeatureGrid title={actionHub.title} description={actionHub.description} routes={actionHub.routes} />
    </div>
  );
}
