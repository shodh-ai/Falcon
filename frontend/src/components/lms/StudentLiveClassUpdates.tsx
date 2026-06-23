'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Video } from 'lucide-react';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import {
  canJoinLiveClass,
  formatLiveClassWhen,
  getLiveClassStatus,
  LIVE_CLASS_STATUS_LABEL,
  type LiveClassRow,
} from '@/lib/live-classes';
import { cn } from '@/lib/utils';

export function StudentLiveClassUpdates() {
  const api = useAuthedApi();
  const [updates, setUpdates] = useState<LiveClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<LiveClassRow[]>('/api/lms/live-classes/updates')
      .then(setUpdates)
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, [api]);

  const liveCount = updates.filter((row) => getLiveClassStatus(row.starts_at, row.ends_at) === 'live').length;

  return (
    <StudentSectionCard
      title="Live class updates"
      description={
        liveCount > 0
          ? `${liveCount} session${liveCount === 1 ? ' is' : 's are'} live right now`
          : 'Recent and upcoming virtual sessions from your faculty'
      }
      icon={Video}
      tone={liveCount > 0 ? 'warning' : 'gold'}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading live sessions…</p>
      ) : updates.length === 0 ? (
        <StudentEmptyState
          title="No live sessions yet"
          description="When faculty schedule a Google Meet or Zoom link, it will appear here and in each course workspace."
        />
      ) : (
        <ul className="space-y-3">
          {updates.map((row) => {
            const status = getLiveClassStatus(row.starts_at, row.ends_at);
            const joinable = canJoinLiveClass(row.starts_at, row.ends_at);
            return (
              <li
                key={row.live_class_id}
                className={cn(
                  'rounded-xl border p-4 text-sm shadow-sm',
                  status === 'live'
                    ? 'border-amber-300/80 bg-amber-50/60'
                    : 'border-border/60 bg-background',
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-sgvu-navy">{row.course_code ?? 'Course'}</p>
                      <Badge
                        variant={status === 'live' ? 'default' : 'secondary'}
                        className={cn('text-[10px]', status === 'live' && 'bg-amber-600 hover:bg-amber-600')}
                      >
                        {LIVE_CLASS_STATUS_LABEL[status]}
                      </Badge>
                    </div>
                    <p className="font-medium text-sgvu-navy/90">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{formatLiveClassWhen(row.starts_at)}</p>
                    {row.course_name ? (
                      <p className="text-xs text-muted-foreground">{row.course_name}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {joinable ? (
                      <Button size="sm" asChild>
                        <a href={row.meeting_url} target="_blank" rel="noreferrer">
                          Join session
                          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/student/courses/${row.course_id}?tab=live`}>Open course</Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </StudentSectionCard>
  );
}
