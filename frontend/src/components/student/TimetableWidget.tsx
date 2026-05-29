'use client';

import { Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TimetableSlot } from '@/lib/mock/student-dashboard';

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
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-sgvu-gold" />
          Today&apos;s Timetable
        </CardTitle>
        <CardDescription>Your registered classes for today</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.length === 0 && (
          <p className="text-sm text-muted-foreground">No registered classes today.</p>
        )}
        {slots.map((slot) => (
          <div
            key={slot.id}
            className={cn(
              'flex items-start justify-between gap-3 rounded-xl border p-4 transition',
              slot.status === 'ongoing' && 'border-sgvu-gold bg-accent shadow-sm ring-1 ring-sgvu-gold/40',
              slot.status === 'done' && 'opacity-60',
            )}
          >
            <div className="min-w-0">
              <p className="font-semibold text-sgvu-navy">{slot.subject}</p>
              <p className="text-sm text-muted-foreground">{slot.room}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {slot.start} – {slot.end}
              </p>
            </div>
            <Badge variant={statusBadge[slot.status].variant}>{statusBadge[slot.status].label}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
