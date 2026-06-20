'use client';

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Announcement = {
  announcement_id: string;
  title: string;
  body_html: string;
  published_at: string;
};

export function NoticeBoardWidget({ className }: { className?: string }) {
  const api = useAuthedApi();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Announcement[]>('/api/admin-ops/announcements/feed')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground', className)}>
        Loading notices…
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <div className={cn('rounded-xl border border-sgvu-gold/30 bg-gradient-to-r from-sgvu-gold/10 to-transparent', className)}>
      <div className="flex items-center gap-2 border-b border-sgvu-gold/20 px-4 py-2">
        <Megaphone className="h-4 w-4 text-sgvu-gold" />
        <p className="text-sm font-bold text-sgvu-navy">Notice Board</p>
      </div>
      <div className="max-h-40 overflow-y-auto px-4 py-3 space-y-3">
        {items.map((item) => (
          <div key={item.announcement_id} className="text-sm">
            <p className="font-semibold text-sgvu-navy">{item.title}</p>
            <div
              className="mt-1 text-muted-foreground line-clamp-2 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: item.body_html }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
