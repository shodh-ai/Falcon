'use client';

import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TimetableSlot } from '@/lib/mock/student-dashboard';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';

interface TimetableWidgetProps {
  slots: TimetableSlot[];
}

const statusBadge = {
  done: { label: 'Done', variant: 'outline' as const },
  ongoing: { label: 'Now', variant: 'secondary' as const },
  upcoming: { label: 'Upcoming', variant: 'outline' as const },
};

export function TimetableWidget({ slots }: TimetableWidgetProps) {
  return (
    <StudentSectionCard
      title="Today's Timetable"
      description="Your registered classes for today"
      icon={Clock}
      className="h-full shadow-md shadow-slate-200/50"
    >
      {slots.length === 0 ? (
        <StudentEmptyState
          icon={Clock}
          title="No classes today"
          description="Your registered timetable has no sessions scheduled for today."
        />
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className={cn(
                'flex items-start justify-between gap-3 rounded-2xl border p-4 transition',
                slot.status === 'ongoing' && 'border-sgvu-gold bg-sgvu-gold/10 shadow-sm ring-1 ring-sgvu-gold/40',
                slot.status === 'done' && 'opacity-60',
                slot.status === 'upcoming' && 'border-border/70 bg-white hover:border-sgvu-gold/40',
              )}
            >
              <div className="min-w-0">
                <p className="font-semibold text-sgvu-navy">{slot.subject}</p>
                <p className="text-sm text-muted-foreground">{slot.room}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {slot.start} – {slot.end}
                </p>
              </div>
              <Badge variant={statusBadge[slot.status].variant}>{statusBadge[slot.status].label}</Badge>
            </div>
          ))}
        </div>
      )}
    </StudentSectionCard>
  );
}
