'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { ExecutiveActionInbox, ExecutiveFeatureGrid, TrafficLightKpi } from '@/components/leadership/executive';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';

const FILTERS = ['ALL', 'BUDGET', 'FINANCE', 'FEE_WAIVER', 'HR', 'ACADEMIC'] as const;

export default function LeadershipApprovalsPage() {
  const api = useLeadershipApi();
  const [inbox, setInbox] = useState<Array<Record<string, unknown>>>([]);
  const [thresholds, setThresholds] = useState<Array<Record<string, unknown>>>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [selected, setSelected] = useState<{ id: string; category: string } | null>(null);

  const reload = useCallback(() => {
    void api.approvalInbox().then(setInbox).catch(() => setInbox([]));
    void api.approvalThresholds().then(setThresholds).catch(() => setThresholds([]));
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const items = useMemo(
    () =>
      inbox
        .filter((item) => filter === 'ALL' || String(item.category) === filter)
        .map((item) => ({
          id: String(item.id),
          category: String(item.category),
          title: String(item.title),
          subtype: item.subtype != null ? String(item.subtype) : undefined,
          amount: item.amount != null ? Number(item.amount) : undefined,
        })),
    [inbox, filter],
  );

  const selectedItem = items.find((i) => i.id === selected?.id && i.category === selected?.category);

  const review = async (category: string, id: string, approve: boolean) => {
    try {
      if (category === 'FINANCE') {
        toast.error('Finance items require OTP verification in Finance portal');
        return;
      }
      await api.reviewApproval({ category, id, approve });
      toast.success(approve ? 'Approved' : 'Rejected');
      setSelected(null);
      reload();
    } catch {
      toast.error('Action failed');
    }
  };

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Action Inbox"
        title="Executive Approvals"
        description="One place for budget, finance, waiver, HR, and academic sign-offs"
      />

      <ExecutiveFeatureGrid
        title={getLeadershipHubRoutes('approvals').title}
        description={getLeadershipHubRoutes('approvals').description}
        routes={getLeadershipHubRoutes('approvals').routes}
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="space-y-1">
          {FILTERS.map((f) => {
            const count =
              f === 'ALL'
                ? inbox.length
                : inbox.filter((i) => String(i.category) === f).length;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                  filter === f ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy hover:bg-sgvu-navy/5'
                }`}
              >
                <span>{f === 'ALL' ? 'All' : f.replace('_', ' ')}</span>
                <span className="text-xs opacity-80">{count}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-6">
          <ExecutiveActionInbox
            items={items}
            onReviewed={reload}
            selectedId={selected ? `${selected.category}-${selected.id}` : null}
            onSelect={(id, category) => setSelected({ id, category })}
          />

          {selectedItem ? (
            <LeadershipSectionCard title="Selected Item" description="Review details before approving">
              <p className="text-lg font-bold text-sgvu-navy">{selectedItem.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedItem.category}
                {selectedItem.amount != null ? ` · ₹${selectedItem.amount.toLocaleString('en-IN')}` : ''}
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => void review(selectedItem.category, selectedItem.id, false)}>
                  Reject
                </Button>
                <Button onClick={() => void review(selectedItem.category, selectedItem.id, true)}>Approve</Button>
              </div>
            </LeadershipSectionCard>
          ) : null}
        </div>
      </div>

      <LeadershipSectionCard title="Approval Thresholds" description="Auto-approve below / Chairman above">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {thresholds.map((t) => (
            <TrafficLightKpi
              key={String(t.category)}
              label={String(t.category)}
              value={`≤₹${Number(t.auto_approve_below).toLocaleString('en-IN')} auto`}
              sub={`>₹${Number(t.chairman_approval_above).toLocaleString('en-IN')} needs Chairman`}
              status="green"
            />
          ))}
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
