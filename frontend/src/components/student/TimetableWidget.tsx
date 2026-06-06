'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, FileText, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getIstMinutesNow, getTimetableSlotStatus, type TimetableSlotStatus } from '@/lib/timetable-ist';
import type { TimetableSlot } from '@/lib/mock/student-dashboard';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';

interface TimetableWidgetProps {
  slots: TimetableSlot[];
}

const statusBadge: Record<TimetableSlotStatus, { label: string; variant: 'outline' | 'secondary' }> = {
  done: { label: 'Done', variant: 'outline' },
  ongoing: { label: 'Now', variant: 'secondary' },
  upcoming: { label: 'Upcoming', variant: 'outline' },
};

export function TimetableWidget({ slots }: TimetableWidgetProps) {
  const [nowMinutes, setNowMinutes] = useState(() => getIstMinutesNow());

  useEffect(() => {
    const tick = () => setNowMinutes(getIstMinutesNow());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const enriched = useMemo(
    () =>
      slots.map((slot) => ({
        ...slot,
        status: getTimetableSlotStatus(slot.start, slot.end, nowMinutes),
      })),
    [slots, nowMinutes],
  );

  return (
    <StudentSectionCard
      title="Today's Timetable"
      description="Your registered classes for today (Asia/Kolkata)"
      icon={Clock}
      className="h-full shadow-md shadow-slate-200/50"
    >
      {enriched.length === 0 ? (
        <StudentEmptyState
          icon={Clock}
          title="No classes today"
          description="Your registered timetable has no sessions scheduled for today."
        />
      ) : (
        <div className="space-y-3">
          {enriched.map((slot) => {
            const badge = statusBadge[slot.status];
            const isNow = slot.status === 'ongoing';
            const courseHref = `/student/courses/${slot.courseId}`;
            const materialsHref = `${courseHref}?tab=materials`;

            return (
              <div
                key={slot.id}
                className={cn(
                  'overflow-hidden rounded-2xl border transition-colors',
                  isNow && 'border-sgvu-gold bg-sgvu-gold/10 shadow-sm ring-1 ring-sgvu-gold/40',
                  slot.status === 'done' && 'opacity-60',
                  slot.status === 'upcoming' && 'border-border/70 bg-white',
                )}
              >
                <Link
                  href={courseHref}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-3 p-4 transition-colors',
                    'hover:bg-gray-50',
                    isNow && 'hover:bg-sgvu-gold/15',
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sgvu-navy">{slot.subject}</p>
                    <p className="text-sm text-muted-foreground">{slot.room}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {slot.start} – {slot.end}
                    </p>
                  </div>
                  <Badge variant={badge.variant} className="shrink-0">
                    {badge.label}
                  </Badge>
                </Link>

                {isNow && (
                  <div className="border-t border-border/50 bg-white/60 px-4 py-3">
                    {slot.liveJoinUrl ? (
                      <Button size="sm" className="w-full sm:w-auto" asChild>
                        <a href={slot.liveJoinUrl} target="_blank" rel="noopener noreferrer">
                          <Video className="h-4 w-4" />
                          Join Live Class
                        </a>
                      </Button>
                    ) : (
                      <Link
                        href={materialsHref}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-sgvu-navy underline-offset-4 transition hover:text-sgvu-gold hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Today&apos;s Materials
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </StudentSectionCard>
  );
}
