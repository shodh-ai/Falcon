'use client';

import Link from 'next/link';
import { AlertTriangle, Bus, CheckCircle2, Home, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FeedItem = {
  id: string;
  type: 'attendance' | 'gate' | 'fee' | 'hostel_entry';
  tone: 'success' | 'danger' | 'warning' | 'info';
  message: string;
  timestamp: string;
  action_label?: string;
  action_href?: string;
};

const TONE_STYLES = {
  success: 'border-emerald-200 bg-emerald-50/80',
  danger: 'border-red-200 bg-red-50/80',
  warning: 'border-amber-200 bg-amber-50/80',
  info: 'border-sky-200 bg-sky-50/80',
};

function FeedIcon({ type, tone }: { type: FeedItem['type']; tone: FeedItem['tone'] }) {
  if (type === 'fee') return <AlertTriangle className="h-4 w-4 text-amber-700" />;
  if (type === 'gate') return <Bus className="h-4 w-4 text-sky-700" />;
  if (type === 'hostel_entry') return <Home className="h-4 w-4 text-emerald-700" />;
  if (tone === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-700" />;
  return <XCircle className="h-4 w-4 text-red-700" />;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ParentFeedCard({ item }: { item: FeedItem }) {
  return (
    <article
      className={cn(
        'rounded-2xl border p-4 shadow-sm transition',
        TONE_STYLES[item.tone],
      )}
    >
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <FeedIcon type={item.type} tone={item.tone} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatTime(item.timestamp)}
          </p>
          <p className="mt-1 text-sm font-medium leading-snug text-sgvu-navy">{item.message}</p>
          {item.action_label && item.action_href ? (
            <Button asChild size="sm" className="mt-3 bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold/90">
              <Link href={item.action_href}>{item.action_label}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
