'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AttendanceMeterWidgetProps {
  percentage: number;
  present: number;
  total: number;
  minimumRequired?: number;
}

export function AttendanceMeterWidget({
  percentage,
  present,
  total,
  minimumRequired = 75,
}: AttendanceMeterWidgetProps) {
  const isLow = percentage < minimumRequired;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <Card className={cn('h-full', isLow && 'border-destructive/40')}>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
        <CardDescription>Aggregate this semester</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative h-36 w-36 shrink-0">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={isLow ? 'hsl(var(--destructive))' : 'hsl(var(--secondary))'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-3xl font-black', isLow ? 'text-destructive' : 'text-sgvu-navy')}>
              {percentage}%
            </span>
            <span className="text-xs text-muted-foreground">present</span>
          </div>
        </div>
        <div className="flex-1 space-y-3 text-center sm:text-left">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{present}</span> of {total} sessions attended
          </p>
          {isLow && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-left text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Below {minimumRequired}% minimum. Hall ticket and exams may be blocked until attendance improves.
              </span>
            </div>
          )}
          {!isLow && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              You meet the {minimumRequired}% requirement. Keep it up!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
