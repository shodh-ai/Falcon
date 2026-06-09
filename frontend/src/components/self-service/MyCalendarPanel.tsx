'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HrAttendanceCalendar } from '@/components/hr/HrAttendanceCalendar';
import { useAuthedApi } from '@/lib/api';

type CalendarData = {
  month: string;
  shift: { shift_name: string; start_time: string; end_time: string } | null;
  holidays: { title: string; date: string; type: string }[];
  leaves: { leave_type: string; start_date: string; end_date: string; status: string }[];
};

export function MyCalendarPanel() {
  const api = useAuthedApi();
  const month = new Date().toISOString().slice(0, 7);
  const [data, setData] = useState<CalendarData | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    void api
      .get<CalendarData>(`/api/hr/ess/calendar?month=${month}`)
      .then(setData)
      .finally(() => setMetaLoading(false));
  }, [api, month]);

  return (
    <div className="space-y-4">
      <HrAttendanceCalendar mode="self" title="Attendance calendar" />

      {metaLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!metaLoading && data?.shift && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s shift</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data.shift.shift_name}: {data.shift.start_time?.slice(0, 5)} – {data.shift.end_time?.slice(0, 5)}
          </CardContent>
        </Card>
      )}

      {!metaLoading && data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming holidays</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {data.holidays.map((h) => (
                <p key={`${h.date}-${h.title}`}>
                  {h.date} — {h.title}
                </p>
              ))}
              {!data.holidays.length && <p>None this month.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approved leaves</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {data.leaves.map((l, i) => (
                <p key={i}>
                  {l.leave_type}: {l.start_date} – {l.end_date} ({l.status})
                </p>
              ))}
              {!data.leaves.length && <p>None this month.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
