'use client';

import { useEffect, useRef, useState } from 'react';
import type { FeedEvent } from '@/lib/api/api.leadership';
import { formatLakhs, MOCK_FEED } from './intelligence-mock-data';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

type FeedItemProps = {
  ev: FeedEvent;
  isNew?: boolean;
};

function FeedItem({ ev, isNew }: FeedItemProps) {
  const isIncome = ev.event_type === 'INCOME';
  const isAlert = ev.event_type === 'ALERT';
  const prefix = isAlert ? '🟡' : isIncome ? '🟢' : '🔴';
  const sign = isIncome ? '+' : isAlert ? '' : '-';
  const amountStr = ev.amount != null ? formatLakhs(ev.amount) : '';

  return (
    <li
      className={`feed-item rounded-xl border px-3 py-3 ${
        isIncome
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : isAlert
            ? 'border-yellow-500/30 bg-yellow-500/10'
            : 'border-red-500/30 bg-red-500/10'
      } ${isNew ? 'feed-slide-in' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            <span className="mr-1">{prefix}</span>
            {sign && amountStr ? (
              <span className={isIncome ? 'text-emerald-400' : 'text-red-400'}>
                [{sign} {amountStr}]
              </span>
            ) : null}{' '}
            <span className="text-slate-200">| {ev.label}</span>
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-slate-500">{formatTime(ev.created_at)}</span>
      </div>
    </li>
  );
}

export function LiveFeedColumn({
  events,
  connected = true,
}: {
  events: FeedEvent[];
  connected?: boolean;
}) {
  const displayEvents = events.length > 0 ? events : MOCK_FEED;
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevCount = useRef(displayEvents.length);

  useEffect(() => {
    if (events.length > prevCount.current && events[0]) {
      setNewIds((s) => new Set(s).add(events[0].event_id));
      const t = setTimeout(() => {
        setNewIds((s) => {
          const next = new Set(s);
          next.delete(events[0].event_id);
          return next;
        });
      }, 600);
      prevCount.current = events.length;
      return () => clearTimeout(t);
    }
    prevCount.current = events.length;
  }, [events]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/30 backdrop-blur-xl">
      <div className="border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-500'}`}
            />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-[#d6b65d]">Live Feed</h3>
          {events.length === 0 ? (
            <span className="ml-auto rounded-full bg-slate-700/60 px-2 py-0.5 text-[9px] text-slate-400">Demo</span>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-2">
          {displayEvents.map((ev) => (
            <FeedItem key={ev.event_id} ev={ev} isNew={newIds.has(ev.event_id)} />
          ))}
        </ul>
      </div>
      <style jsx global>{`
        @keyframes feedSlideIn {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .feed-slide-in {
          animation: feedSlideIn 0.45s ease-out;
        }
      `}</style>
    </div>
  );
}
