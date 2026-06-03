'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  ATTENDANCE_LEGEND,
  attendanceCircleStyle,
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
} & ({ mode: 'self' } | { mode: 'matrix' });

function monthMeta(month: string) {
  const [year, monthNum] = month.split('-').map(Number);
  const first = new Date(year, monthNum - 1, 1);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const leading = first.getDay();
  return { year, monthNum, daysInMonth, leading };
}

export function HrAttendanceCalendar(props: Props) {
  const api = useAuthedApi();
  const [internalMonth, setInternalMonth] = useState(new Date().toISOString().slice(0, 7));
  const month = props.month ?? internalMonth;
  const showMonthPicker = props.month === undefined;
  const [loading, setLoading] = useState(true);
  const [selfData, setSelfData] = useState<CalendarPayload | null>(null);
  const [matrixData, setMatrixData] = useState<MatrixPayload | null>(null);

  useEffect(() => {
    setLoading(true);
    if (props.mode === 'self') {
      void api
        .get<CalendarPayload>(`/api/hr/attendance/calendar?month=${month}`)
        .then(setSelfData)
        .finally(() => setLoading(false));
    } else {
      void api
        .get<MatrixPayload>(`/api/hr/attendance/matrix?month=${month}`)
        .then(setMatrixData)
        .finally(() => setLoading(false));
    }
  }, [api, month, props.mode]);

  const { year, monthNum, daysInMonth, leading } = monthMeta(month);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">{props.title ?? 'Attendance calendar'}</CardTitle>
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
              className="rounded-md border px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setInternalMonth(e.target.value)}
            />
          )}
          <div className="max-w-xs space-y-1 text-[10px]">
            {ATTENDANCE_LEGEND.map((item) => (
              <div key={item.status} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
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
          <div className="overflow-x-auto">
            {matrixData.employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employees found.</p>
            ) : (
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 bg-background p-2 text-left">Employee</th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = i + 1;
                      const date = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      return (
                        <th key={date} className="p-0.5 text-center font-normal" title={date}>
                          {d}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.employees.map((emp) => (
                    <tr key={emp.user_id} className="border-b">
                      <td className="sticky left-0 bg-background p-2 font-medium whitespace-nowrap">
                        {emp.name}
                      </td>
                      {emp.days.map((day) => {
                        const style = attendanceCircleStyle(day.calculated_status);
                        return (
                          <td key={day.date} className="p-0.5 text-center">
                            <span
                              className="inline-block h-5 w-5 rounded-full"
                              style={style}
                              title={day.tooltip}
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
      </CardContent>
    </Card>
  );
}
