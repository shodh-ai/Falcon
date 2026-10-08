'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExecutiveActionInbox,
  ExecutiveFeatureGrid,
  ExecutiveHeroKpi,
  EXECUTIVE_SPACING,
} from '@/components/leadership/executive';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

export default function LeadershipActionCenterPage() {
  const api = useLeadershipApi();
  const [actionSummary, setActionSummary] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);

  const reload = () => {
    void api.actionSummary().then(setActionSummary).catch(() => setActionSummary(null));
    void api.executiveTasks().then(setTasks).catch(() => setTasks([]));
  };

  useEffect(() => {
    reload();
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

  const openTasks = tasks.filter((t) => ['OPEN', 'IN_PROGRESS', 'OVERDUE'].includes(String(t.status)));

  const actionHub = getLeadershipHubRoutes('approvals');

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Executive Action & Control"
        title="Action Center"
        description="Proactive command hub — approvals, tasks, compliance, and strategic follow-through"
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
          value={String(actionSummary?.open_tasks ?? openTasks.length ?? '0')}
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
        onReviewed={reload}
      />

      <LeadershipSectionCard title="Executive Tasks" description="Delegated follow-through — not firefighting">
        <div className="space-y-2">
          {openTasks.slice(0, 6).map((task) => (
            <div
              key={String(task.task_id)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sgvu-navy/10 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-sgvu-navy">{String(task.title)}</div>
                <div className="text-xs text-muted-foreground">
                  {String(task.priority)} · {String(task.status)}
                  {task.due_at ? ` · due ${new Date(String(task.due_at)).toLocaleDateString()}` : ''}
                </div>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  task.status === 'OVERDUE'
                    ? 'bg-red-100 text-red-800'
                    : task.priority === 'CRITICAL'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {String(task.status)}
              </span>
            </div>
          ))}
          {!openTasks.length && (
            <p className="text-sm text-muted-foreground">No open executive tasks.</p>
          )}
        </div>
        <Link href="/leadership/tasks" className="mt-3 inline-block text-xs font-bold text-sgvu-gold hover:underline">
          All tasks →
        </Link>
      </LeadershipSectionCard>

      <ExecutiveFeatureGrid title={actionHub.title} description={actionHub.description} routes={actionHub.routes} />
    </div>
  );
}
