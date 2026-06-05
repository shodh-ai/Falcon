'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HrAttendanceCalendar } from '@/components/hr/HrAttendanceCalendar';
import { useHrApi } from '@/lib/api/use-hr-api';

type CalendarData = {
  month: string;
  shift: { shift_name: string; start_time: string; end_time: string } | null;
  holidays: { title: string; date: string; type: string }[];
  leaves: { leave_type: string; start_date: string; end_date: string; status: string }[];
};

export default function EssCalendarPage() {
  const api = useHrApi();
  const month = new Date().toISOString().slice(0, 7);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.get<CalendarData>(`/api/hr/ess/calendar?month=${month}`).then(setData).finally(() => setLoading(false));
  }, [api, month]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">My Calendar</h2>
        <p className="text-sm text-muted-foreground">Shift timings, holidays, and approved leaves.</p>
      </section>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading && data?.shift && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s shift</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data.shift.shift_name}: {data.shift.start_time?.slice(0, 5)} – {data.shift.end_time?.slice(0, 5)}
          </CardContent>
        </Card>
      )}

      <HrAttendanceCalendar mode="self" title="Attendance calendar" />

      {!loading && data && (
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
