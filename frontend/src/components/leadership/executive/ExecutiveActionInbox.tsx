'use client';

import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { ExecutiveCard } from './ExecutiveCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

export type InboxItem = {
  id: string;
  category: string;
  title: string;
  subtype?: string;
  amount?: number;
};

type Props = {
  items: InboxItem[];
  compact?: boolean;
  onReviewed?: () => void;
  selectedId?: string | null;
  onSelect?: (id: string, category: string) => void;
};

export function ExecutiveActionInbox({
  items,
  compact = false,
  onReviewed,
  selectedId,
  onSelect,
}: Props) {
  const api = useLeadershipApi();

  const review = async (category: string, id: string, approve: boolean) => {
    try {
      if (category === 'FINANCE') {
        toast.error('Finance items require OTP verification in Finance portal');
        return;
      }
      await api.reviewApproval({ category, id, approve });
      toast.success(approve ? 'Approved' : 'Rejected');
      onReviewed?.();
    } catch {
      toast.error('Action failed');
    }
  };

  const list = compact ? items.slice(0, 5) : items;

  return (
    <ExecutiveCard
      title={compact ? 'Urgent Approvals' : 'Action Inbox'}
      description={compact ? 'Approve or reject without leaving your briefing' : 'All pending sign-offs across departments'}
      action={
        compact ? (
          <Link href="/leadership/approvals" className="text-xs font-bold text-sgvu-gold hover:underline">
            View all →
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {list.map((item) => {
          const key = `${item.category}-${item.id}`;
          const selected = selectedId === key;
          return (
            <div
              key={key}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => onSelect(item.id, item.category) : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onSelect(item.id, item.category);
                    }
                  : undefined
              }
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                selected ? 'border-sgvu-gold bg-sgvu-gold/5' : 'border-sgvu-navy/10 hover:border-sgvu-navy/20'
              } ${onSelect ? 'cursor-pointer' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sgvu-navy">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category}
                  {item.subtype ? ` · ${item.subtype}` : ''}
                  {item.amount != null ? ` · ₹${Number(item.amount).toLocaleString('en-IN')}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" onClick={() => void review(item.category, item.id, false)}>
                  Reject
                </Button>
                <Button size="sm" onClick={() => void review(item.category, item.id, true)}>
                  Approve
                </Button>
              </div>
            </div>
          );
        })}
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Inbox clear — nothing pending your sign-off</p>
        ) : null}
      </div>
    </ExecutiveCard>
  );
}
