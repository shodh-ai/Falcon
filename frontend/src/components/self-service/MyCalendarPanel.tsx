'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Palmtree, Briefcase } from 'lucide-react';
import { FacultyPanel, FacultyEmptyState, FacultyInlineLoading } from '@/components/faculty';
import { HrAttendanceCalendar } from '@/components/hr/HrAttendanceCalendar';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  formatWorkforceDate,
  formatWorkforceDateRange,
  leaveTypeLabel,
  leaveStatusLabel,
} from '@/lib/workforce-dates';
import { cn } from '@/lib/utils';
import { useShowMoreList, ShowMoreButton } from '@/components/self-service/ShowMoreList';
import { withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import {
  facultyDemoHolidays,
  facultyDemoHrToday,
  facultyDemoLeaveRequests,
} from '@/lib/mock/faculty-portal-demo';

type CalendarData = {
  month: string;
  shift: { shift_name: string; start_time: string; end_time: string } | null;
  holidays: { title: string; date: string; type: string }[];
  leaves: { leave_type: string; start_date: string; end_date: string; status: string }[];
};

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'HR_APPROVED' || status === 'HOD_APPROVED') return 'default';
  if (status === 'PENDING') return 'secondary';
  if (status === 'REJECTED') return 'destructive';
  return 'outline';
}

export function MyCalendarPanel() {
  const api = useAuthedApi();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CalendarData | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    setMetaLoading(true);
    const demoCalendar = (): CalendarData => {
      const hr = facultyDemoHrToday() as {
        shift?: { shift_name?: string; start?: string; end?: string; start_time?: string; end_time?: string };
      };
      const holidayPack = facultyDemoHolidays() as {
        mandatory?: Array<{ title: string; date: string; type?: string }>;
        restricted?: Array<{ title: string; date: string; type?: string }>;
      };
      const holidays = [...(holidayPack.mandatory ?? []), ...(holidayPack.restricted ?? [])]
        .filter((h) => String(h.date).startsWith(month))
        .map((h) => ({ title: h.title, date: h.date, type: h.type ?? 'HOLIDAY' }));
      const leaves = facultyDemoLeaveRequests().map((r) => ({
        leave_type: r.leave_type,
        start_date: r.start_date,
        end_date: r.end_date,
        status: r.status,
      }));
      return {
        month,
        shift: {
          shift_name: hr.shift?.shift_name ?? 'General',
          start_time: hr.shift?.start_time ?? hr.shift?.start ?? '09:00',
          end_time: hr.shift?.end_time ?? hr.shift?.end ?? '17:00',
        },
        holidays,
        leaves,
      };
    };

    void api
      .get<CalendarData>(`/api/hr/ess/calendar?month=${month}`)
      .then((live) =>
        setData(
          withFacultyDemoFallback(
            live,
            demoCalendar(),
            (v) => !v || ((v.holidays?.length ?? 0) === 0 && (v.leaves?.length ?? 0) === 0),
          ),
        ),
      )
      .catch(() => setData(withFacultyDemoFallback(null, demoCalendar())))
      .finally(() => setMetaLoading(false));
  }, [api, month]);

  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const holidaysList = useShowMoreList(data?.holidays ?? [], month);
  const leavesList = useShowMoreList(data?.leaves ?? [], month);

  return (
    <div className="space-y-4">
      <FacultyPanel
        title="Attendance calendar"
        description={
          data?.shift
            ? `${data.shift.shift_name}: ${data.shift.start_time?.slice(0, 5)} – ${data.shift.end_time?.slice(0, 5)}`
            : 'Monthly punch and calculated status'
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-sgvu-navy">{monthLabel}</p>
          <input
            type="month"
            className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <HrAttendanceCalendar mode="self" month={month} embedded holidays={data?.holidays} />
      </FacultyPanel>

      {metaLoading ? (
        <FacultyInlineLoading label="Loading holidays and leave…" />
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <FacultyPanel title="Holidays this month" count={data.holidays.length}>
            {data.holidays.length === 0 ? (
              <FacultyEmptyState description="No holidays scheduled this month." className="py-6" />
            ) : (
              <>
                <ul className="space-y-2">
                  {holidaysList.visible.map((h) => (
                    <li
                      key={`${h.date}-${h.title}`}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm"
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-sgvu-gold" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sgvu-navy">{h.title}</p>
                        <p className="text-xs text-muted-foreground">{formatWorkforceDate(h.date)}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 text-[10px]',
                          h.type === 'MANDATORY' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800',
                        )}
                      >
                        {h.type === 'RESTRICTED' ? 'Optional' : 'Mandatory'}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <ShowMoreButton
                  expanded={holidaysList.expanded}
                  hiddenCount={holidaysList.hiddenCount}
                  onClick={holidaysList.toggle}
                />
              </>
            )}
          </FacultyPanel>

          <FacultyPanel title="Leave this month" count={data.leaves.length}>
            {data.leaves.length === 0 ? (
              <FacultyEmptyState description="No leave or OD requests overlap this month." className="py-6" />
            ) : (
              <>
                <ul className="space-y-2">
                  {leavesList.visible.map((l, i) => (
                    <li
                      key={`${l.leave_type}-${l.start_date}-${i}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border/50 bg-background px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {l.leave_type === 'OD' || l.leave_type === 'ON_DUTY' ? (
                          <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
                        ) : (
                          <Palmtree className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sgvu-navy">{leaveTypeLabel(l.leave_type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatWorkforceDateRange(l.start_date, l.end_date)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={statusBadgeVariant(l.status)} className="shrink-0 text-[10px]">
                        {leaveStatusLabel(l.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <ShowMoreButton
                  expanded={leavesList.expanded}
                  hiddenCount={leavesList.hiddenCount}
                  onClick={leavesList.toggle}
                />
              </>
            )}
          </FacultyPanel>
        </div>
      ) : null}
    </div>
  );
}
