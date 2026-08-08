'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, User, Video } from 'lucide-react';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { useAuthedApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DEMO_WEEKLY_TIMETABLE } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { toast } from '@/lib/notifications/falcon-toast';

type WeekDate = {
  day_of_week: number;
  label: string;
  date: string;
};

type TimetableSlot = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  faculty_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_virtual: boolean;
  live_join_url: string | null;
  session_date: string | null;
  attendance_status: 'PRESENT' | 'ABSENT' | 'PENDING' | null;
};

type WeekTimetableResponse = {
  week_start: string;
  week_dates: WeekDate[];
  slots: TimetableSlot[];
};

type TimeColumn =
  | { type: 'slot'; hour: number; label: string }
  | { type: 'lunch'; label: string };

const TIME_COLUMNS: TimeColumn[] = [
  { type: 'slot', hour: 9, label: '9:00 AM' },
  { type: 'slot', hour: 10, label: '10:00 AM' },
  { type: 'slot', hour: 11, label: '11:00 AM' },
  { type: 'slot', hour: 12, label: '12:00 PM' },
  { type: 'lunch', label: 'Lunch' },
  { type: 'slot', hour: 14, label: '2:00 PM' },
  { type: 'slot', hour: 15, label: '3:00 PM' },
  { type: 'slot', hour: 16, label: '4:00 PM' },
];

function formatDisplayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function slotStartHour(startTime: string) {
  return Number.parseInt(startTime.split(':')[0] ?? '0', 10);
}

function shiftWeekStart(weekStart: string, deltaWeeks: number) {
  const d = new Date(`${weekStart}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function attendanceBadge(status: TimetableSlot['attendance_status']) {
  if (!status) return null;
  if (status === 'PRESENT') {
    return <Badge variant="success">Present</Badge>;
  }
  if (status === 'ABSENT') {
    return <Badge variant="destructive">Absent</Badge>;
  }
  return <Badge variant="secondary">Pending</Badge>;
}

function to12h(hhmm: string) {
  const [hRaw, mRaw] = hhmm.slice(0, 5).split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (Number.isNaN(h)) return hhmm.slice(0, 5);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function buildDemoWeekTimetable(
  weekStart?: string,
  weekDates?: WeekDate[],
): WeekTimetableResponse {
  const monday = weekStart
    ? new Date(`${weekStart}T12:00:00`)
    : (() => {
        const d = new Date();
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d;
      })();
  const startIso = monday.toISOString().slice(0, 10);
  const dates =
    weekDates?.length === 6
      ? weekDates
      : Array.from({ length: 6 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          return {
            day_of_week: i + 1,
            label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
            date: d.toISOString().slice(0, 10),
          };
        });
  return {
    week_start: startIso,
    week_dates: dates,
    slots: DEMO_WEEKLY_TIMETABLE.map((s) => ({
      ...s,
      session_date: dates.find((d) => d.day_of_week === s.day_of_week)?.date ?? null,
    })),
  };
}

function SlotButton({
  slot,
  onSelect,
}: {
  slot: TimetableSlot;
  onSelect: (slot: TimetableSlot) => void;
}) {
  const subject = slot.course_name?.trim() || slot.course_code;
  const timing = `${to12h(slot.start_time)} – ${to12h(slot.end_time)}`;
  const room = slot.is_virtual ? 'Online' : slot.room?.trim() || 'Room TBA';

  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      title={`${subject} · ${timing} · ${room}`}
      className={cn(
        'flex h-full min-h-[5.5rem] w-full flex-col justify-between gap-1 rounded-lg p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        slot.is_virtual
          ? 'border border-blue-200 bg-blue-50 text-blue-950'
          : 'border border-sgvu-navy/10 bg-[#0B2447] text-white',
      )}
    >
      <div className="min-w-0">
        <p className="line-clamp-2 text-[11px] font-bold leading-snug">{subject}</p>
        {slot.course_code && slot.course_name ? (
          <p
            className={cn(
              'mt-0.5 truncate text-[9px] font-semibold uppercase tracking-wide',
              slot.is_virtual ? 'text-blue-700/80' : 'text-sgvu-gold',
            )}
          >
            {slot.course_code}
          </p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-0.5">
        <p
          className={cn(
            'flex items-center gap-1 truncate text-[10px] font-semibold',
            slot.is_virtual ? 'text-blue-900/85' : 'text-white/90',
          )}
        >
          <Clock className="h-3 w-3 shrink-0 opacity-80" />
          <span className="truncate">{timing}</span>
        </p>
        <p
          className={cn(
            'flex items-center gap-1 truncate text-[10px] font-semibold',
            slot.is_virtual ? 'text-blue-900/85' : 'text-white/90',
          )}
        >
          {slot.is_virtual ? (
            <Video className="h-3 w-3 shrink-0 opacity-80" />
          ) : (
            <MapPin className="h-3 w-3 shrink-0 opacity-80" />
          )}
          <span className="truncate">{room}</span>
        </p>
      </div>
    </button>
  );
}

export default function TimetablePage() {
  const api = useAuthedApi();
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const [data, setData] = useState<WeekTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [activeDay, setActiveDay] = useState('1');

  const loadWeek = useCallback(
    async (start?: string) => {
      setLoading(true);
      try {
        const query = start ? `?weekStart=${encodeURIComponent(start)}` : '';
        const response = await api.get<WeekTimetableResponse>(
          `/api/academics/dashboard/timetable/week${query}`,
        );
        if (!response.slots?.length) {
          setData(
            isStudentDemoModeEnabled()
              ? buildDemoWeekTimetable(response.week_start, response.week_dates)
              : { ...response, slots: [] },
          );
          setWeekStart(response.week_start);
        } else {
          setData(response);
          setWeekStart(response.week_start);
        }
      } catch {
        if (isStudentDemoModeEnabled()) {
          setData(buildDemoWeekTimetable());
        } else {
          setData(null);
          toast.error('Could not load timetable');
        }
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadWeek(weekStart);
  }, [weekStart, loadWeek]);

  const weekDates = data?.week_dates ?? [];
  const slots = data?.slots ?? [];

  const slotGrid = useMemo(() => {
    const map = new Map<string, TimetableSlot>();
    for (const slot of slots) {
      const key = `${slot.day_of_week}|${slotStartHour(slot.start_time)}`;
      if (!map.has(key)) {
        map.set(key, slot);
      }
    }
    return map;
  }, [slots]);

  const weekRangeLabel =
    weekDates.length >= 2
      ? `${formatDisplayDate(weekDates[0].date)} – ${formatDisplayDate(weekDates[weekDates.length - 1].date)}`
      : '';

  return (
    <StudentPageShell width="full">
      <section className="mb-4 overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-white p-5 shadow-sm md:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">Academics</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">
          Timetable
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each class shows subject, timing, and room. Tap a slot for faculty and attendance details.
        </p>
      </section>

      <StudentSectionCard
        title="Schedule"
        description="Subject · timing · room number for every class"
        icon={CalendarDays}
        className="border-sgvu-navy/10 bg-white"
      >
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 border-sgvu-navy/20 bg-white"
              onClick={() => weekStart && setWeekStart(shiftWeekStart(weekStart, -1))}
              disabled={!weekStart}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] text-center text-sm font-semibold text-sgvu-navy">
              {weekRangeLabel || 'This week'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 border-sgvu-navy/20 bg-white"
              onClick={() => weekStart && setWeekStart(shiftWeekStart(weekStart, 1))}
              disabled={!weekStart}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Loading timetable...
          </div>
        ) : (
          <>
            <div className="relative hidden overflow-x-auto pb-2 lg:block">
              <div className="overflow-x-auto rounded-xl border border-sgvu-navy/10 bg-white">
                <table className="w-full min-w-[1100px] border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-28 border-b border-r border-sgvu-navy/10 bg-white p-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Day
                      </th>
                      {TIME_COLUMNS.map((col) => (
                        <th
                          key={col.type === 'lunch' ? 'lunch' : col.hour}
                          className={cn(
                            'min-w-[120px] border-b border-r border-sgvu-navy/10 bg-white p-2.5 text-center text-[10px] font-bold uppercase tracking-wider',
                            col.type === 'lunch' ? 'text-muted-foreground' : 'text-sgvu-navy',
                          )}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weekDates.map((day) => (
                      <tr key={day.date}>
                        <th className="sticky left-0 z-10 border-b border-r border-sgvu-navy/10 bg-white p-2.5 text-center align-middle">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-sgvu-navy">
                            {day.label}
                          </div>
                          <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                            {formatDisplayDate(day.date)}
                          </div>
                        </th>
                        {TIME_COLUMNS.map((col) => {
                          if (col.type === 'lunch') {
                            return (
                              <td
                                key={`${day.date}-lunch`}
                                className="border-b border-r border-sgvu-navy/10 bg-slate-50 p-1 text-center align-middle text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground"
                              >
                                Lunch
                              </td>
                            );
                          }

                          const slot = slotGrid.get(`${day.day_of_week}|${col.hour}`);
                          return (
                            <td
                              key={`${day.date}-${col.hour}`}
                              className="relative h-[6.25rem] min-w-[120px] border-b border-r border-sgvu-navy/10 align-top p-1.5"
                            >
                              {slot ? (
                                <SlotButton slot={slot} onSelect={setSelectedSlot} />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 lg:hidden">
              <Tabs value={activeDay} onValueChange={setActiveDay}>
                <TabsList className="mb-4 flex w-full justify-start overflow-x-auto">
                  {weekDates.map((day) => (
                    <TabsTrigger key={day.date} value={String(day.day_of_week)} className="min-w-[72px]">
                      {day.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {weekDates.map((day) => {
                  const daySlots = slots
                    .filter((s) => s.day_of_week === day.day_of_week)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  return (
                    <TabsContent key={day.date} value={String(day.day_of_week)} className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {day.label}, {formatDisplayDate(day.date)}
                      </p>
                      {daySlots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
                          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/50" />
                          <p className="text-sm font-medium text-muted-foreground">No classes today</p>
                        </div>
                      ) : (
                        daySlots.map((slot) => (
                          <button
                            key={slot.timetable_id}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={cn(
                              'w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-sgvu-gold/40',
                              slot.is_virtual ? 'border-blue-200 bg-blue-50/30' : 'bg-white',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-sgvu-navy">{slot.course_name}</p>
                                <p className="text-xs font-medium text-muted-foreground">{slot.course_code}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {slot.is_virtual && <Badge variant="secondary">Virtual</Badge>}
                                {attendanceBadge(slot.attendance_status)}
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 shrink-0 text-sgvu-navy" />
                                <span className="font-medium text-sgvu-navy">
                                  {to12h(slot.start_time)} – {to12h(slot.end_time)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 shrink-0 text-sgvu-navy" />
                                <span className="font-medium text-sgvu-navy">
                                  {slot.is_virtual ? 'Online' : slot.room ?? 'Room TBA'}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </>
        )}
      </StudentSectionCard>

      <Dialog open={Boolean(selectedSlot)} onOpenChange={(open) => !open && setSelectedSlot(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedSlot && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedSlot.course_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Course code</p>
                  <p className="font-semibold text-sgvu-navy">{selectedSlot.course_code}</p>
                </div>
                {selectedSlot.session_date && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p>
                    <p className="font-medium">
                      {new Date(`${selectedSlot.session_date}T12:00:00`).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Timing</p>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-sgvu-navy">
                      <Clock className="h-4 w-4" />
                      {to12h(selectedSlot.start_time)} – {to12h(selectedSlot.end_time)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Room number</p>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-sgvu-navy">
                      {selectedSlot.is_virtual ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <MapPin className="h-4 w-4" />
                      )}
                      {selectedSlot.room ?? (selectedSlot.is_virtual ? 'Online' : 'Room TBA')}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject name</p>
                  <p className="mt-1 font-semibold text-sgvu-navy">{selectedSlot.course_name}</p>
                </div>
                {selectedSlot.faculty_name && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Faculty</p>
                    <p className="flex items-center gap-2 font-medium">
                      <User className="h-4 w-4" />
                      {selectedSlot.faculty_name}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Attendance</p>
                  <div className="mt-1">
                    {selectedSlot.attendance_status ? (
                      attendanceBadge(selectedSlot.attendance_status)
                    ) : (
                      <Badge variant="outline">Not yet held / upcoming</Badge>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </StudentPageShell>
  );
}

