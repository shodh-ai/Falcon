'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { useOptionalHrEntity } from '@/context/HrEntityContext';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { Users, Download } from 'lucide-react';
import {
  ATTENDANCE_LEGEND,
  HEATMAP_LEGEND,
  attendanceCircleStyle,
  attendanceHeatmapColor,
  type CalculatedAttendanceStatus,
} from '@/lib/hr-attendance-status';

export type CalendarDay = {
  date: string;
  calculated_status: CalculatedAttendanceStatus;
  tooltip: string;
};

type CalendarPayload = {
  month: string;
  shift?: { shift_name: string; start_time: string; end_time: string };
  days: CalendarDay[];
};

type MatrixPayload = {
  month: string;
  employees: {
    user_id: string;
    name: string;
    days: CalendarDay[];
  }[];
};

type Props = {
  title?: string;
  month?: string;
  /** When true, renders calendar grid only (no outer card chrome). */
  embedded?: boolean;
} & ({ mode: 'self' } | { mode: 'matrix' });

function monthMeta(month: string) {
  const [year, monthNum] = month.split('-').map(Number);
  const first = new Date(year, monthNum - 1, 1);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const leading = first.getDay();
  return { year, monthNum, daysInMonth, leading };
}

export function HrAttendanceCalendar(props: Props) {
  const authedApi = useAuthedApi();
  const hrEntity = useOptionalHrEntity();
  const entityId = hrEntity?.entityId ?? null;
  const entityReady = hrEntity?.entityReady ?? false;
  const matrixApi = useMemo(
    () => ({
      get: (path: string) => {
        if (!hrEntity?.entityId) {
          return Promise.reject(new Error('Organization entity required'));
        }
        return authedApi.get(hrEntity.withEntityQuery(path), hrEntity.entityHeaders);
      },
    }),
    [authedApi, hrEntity],
  );
  const [internalMonth, setInternalMonth] = useState(new Date().toISOString().slice(0, 7));
  const month = props.month ?? internalMonth;
  const showMonthPicker = props.month === undefined;
  const [loading, setLoading] = useState(true);
  const [selfData, setSelfData] = useState<CalendarPayload | null>(null);
  const [matrixData, setMatrixData] = useState<MatrixPayload | null>(null);

  useEffect(() => {
    setLoading(true);
    if (props.mode === 'self') {
      void authedApi
        .get<CalendarPayload>(`/api/hr/attendance/calendar?month=${month}`)
        .then(setSelfData)
        .finally(() => setLoading(false));
      return;
    }
    if (!entityReady) return;
    void matrixApi
      .get(`/api/hr/attendance/matrix?month=${month}`)
      .then((data) => setMatrixData(data as MatrixPayload))
      .finally(() => setLoading(false));
  }, [authedApi, entityId, entityReady, matrixApi, month, props.mode]);

  const { year, monthNum, daysInMonth, leading } = monthMeta(month);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const legend = (
    <div className="flex flex-wrap gap-3 text-[11px] font-medium text-muted-foreground">
      {(props.mode === 'matrix' ? HEATMAP_LEGEND : ATTENDANCE_LEGEND).map((item) => (
        <div
          key={'status' in item ? item.status : item.label}
          className="flex items-center gap-1.5"
        >
          <span
            className="inline-block h-3 w-3 rounded-full ring-1 ring-black/5"
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );

  const calendarBody = (
    <>
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      )}

      {!loading && props.mode === 'self' && selfData && (
        <div className="grid grid-cols-7 gap-2">
          {dayLabels.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: leading }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {selfData.days.map((day) => {
            const style = attendanceCircleStyle(day.calculated_status);
            return (
              <div key={day.date} className="flex flex-col items-center gap-1" title={day.tooltip}>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={style}
                >
                  {new Date(`${day.date}T12:00:00`).getDate()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && props.mode === 'matrix' && matrixData && (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            {matrixData.employees.length === 0 ? (
              <HrEmptyState
                icon={Users}
                title="No attendance matrix data"
                description="Employee attendance will appear once biometric records are synced."
              />
            ) : (
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="sticky left-0 z-10 bg-gray-50/95 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Employee
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = i + 1;
                      const date = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      return (
                        <th
                          key={date}
                          className="px-0.5 py-2 text-center text-[10px] font-medium text-muted-foreground"
                          title={date}
                        >
                          {d}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matrixData.employees.map((emp) => (
                    <tr key={emp.user_id} className="group transition-colors hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <HrPersonCell name={emp.name} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-sgvu-navy"
                            onClick={() => {
                              const token = document.cookie.replace(/(?:(?:^|.*;\s*)access_token\s*=\s*([^;]*).*$)|^.*$/, "$1");
                              const url = new URL(`${window.location.origin}/api/hr/reports/attendance/export/${emp.user_id}`);
                              url.searchParams.set('month', month);
                              if (entityId) url.searchParams.set('entity_id', String(entityId));
                              
                              fetch(url.toString(), {
                                headers: { Authorization: `Bearer ${token}` }
                              })
                              .then(res => res.blob())
                              .then(blob => {
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = `attendance-${emp.name.replace(/ /g, '_')}-${month}.xlsx`;
                                a.click();
                              });
                            }}
                            title="Export Attendance"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      {emp.days.map((day) => {
                        const color = attendanceHeatmapColor(day.calculated_status);
                        return (
                          <td key={day.date} className="px-0.5 py-1.5 text-center">
                            <span
                              className="mx-auto inline-block h-6 w-6 rounded-md ring-1 ring-black/5 transition-transform hover:scale-110"
                              style={{ backgroundColor: color }}
                              title={day.tooltip}
                              aria-label={day.tooltip}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
    </>
  );

  if (props.embedded) {
    return (
      <div className="space-y-3">
        {legend}
        {calendarBody}
      </div>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-4 border-b border-border/50 bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base text-sgvu-navy">{props.title ?? 'Attendance calendar'}</CardTitle>
          {selfData?.shift && (
            <p className="mt-1 text-xs text-muted-foreground">
              Shift: {selfData.shift.shift_name} ({selfData.shift.start_time?.slice(0, 5)} –{' '}
              {selfData.shift.end_time?.slice(0, 5)})
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-4">
          {showMonthPicker && (
            <input
              type="month"
              className="rounded-lg border border-border/60 px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setInternalMonth(e.target.value)}
            />
          )}
          {legend}
        </div>
      </CardHeader>
      <CardContent>{calendarBody}</CardContent>
    </Card>
  );
}
