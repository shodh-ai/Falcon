'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import {
  categoryMeta,
  formatShortDate,
  type AcademicCalendarEvent,
} from '@/lib/student/academic-calendar';
import { cn } from '@/lib/utils';

export function UpcomingAcademicEventsCard({
  events,
  loading,
}: {
  events: AcademicCalendarEvent[];
  loading?: boolean;
}) {
  const upcoming = events
    .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sgvu-gold/25 text-sgvu-navy">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-sgvu-navy">Upcoming Events</h3>
            <p className="text-xs text-muted-foreground">Next exams, fees, festivals & campus dates</p>
          </div>
        </div>
        <Link
          href="/student/academic-calendar"
          className="inline-flex items-center gap-1 text-xs font-semibold text-sgvu-navy hover:underline"
        >
          View Full Calendar
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sgvu-navy/15 bg-slate-50 px-3 py-6 text-center text-sm text-muted-foreground">
          No upcoming academic events scheduled.
        </p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((event) => {
            const meta = categoryMeta(event.category);
            return (
              <li key={event.event_id}>
                <Link
                  href={`/student/academic-calendar?event=${encodeURIComponent(event.event_id)}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', meta.dotClass)} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sgvu-navy">{event.title}</p>
                      <p className="text-[11px] text-muted-foreground">{meta.shortLabel}</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-xs font-bold text-sgvu-navy">
                    {formatShortDate(event.date)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
