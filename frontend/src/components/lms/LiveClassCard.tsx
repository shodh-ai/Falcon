'use client';

import { ExternalLink, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  canJoinLiveClass,
  formatLiveClassWhen,
  getLiveClassStatus,
  LIVE_CLASS_STATUS_LABEL,
  type LiveClassRow,
} from '@/lib/live-classes';
import { cn } from '@/lib/utils';

export function LiveClassCard({
  liveClass,
  showJoin = false,
}: {
  liveClass: LiveClassRow;
  showJoin?: boolean;
}) {
  const status = getLiveClassStatus(liveClass.starts_at, liveClass.ends_at);
  const joinable = showJoin && canJoinLiveClass(liveClass.starts_at, liveClass.ends_at);

  return (
    <div
      className={cn(
        'rounded-xl border p-3 text-sm',
        status === 'live' ? 'border-amber-300/70 bg-amber-50/50' : 'border-border/60 bg-muted/20',
      )}
    >
      <div className="flex items-start gap-2">
        <Video className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sgvu-navy">{liveClass.title}</p>
            <Badge variant={status === 'live' ? 'default' : 'secondary'} className="text-[10px]">
              {LIVE_CLASS_STATUS_LABEL[status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{formatLiveClassWhen(liveClass.starts_at)}</p>
        </div>
      </div>
      {joinable ? (
        <Button size="sm" className="mt-2 gap-1.5" asChild>
          <a href={liveClass.meeting_url} target="_blank" rel="noreferrer">
            Join session
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
