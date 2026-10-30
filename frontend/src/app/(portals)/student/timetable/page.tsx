'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, User, Video } from 'lucide-react';
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
  substitute_faculty_name?: string | null;
  is_extra_class?: boolean;
  section: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_virtual: boolean;
  live_join_url: string | null;
  session_date: string | null;
  attendance_status: 'PRESENT' | 'ABSENT' | 'PENDING' | null;
  cancelled?: boolean;
};

type WeekTimetableResponse = {
  week_start: string;
  week_dates: WeekDate[];
  slots: TimetableSlot[];
  pending_practical_batches?: Array<{
    course_id: string;
    course_code: string;
    course_name: string;
  }>;
  conflict_count?: number;
};

function formatDisplayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
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
    pending_practical_batches: [],
    conflict_count: 0,
    slots: DEMO_WEEKLY_TIMETABLE.map((s) => ({
      ...s,
      section: null,
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
  const batch = slot.section?.toUpperCase().startsWith('BATCH-')
    ? `Batch ${slot.section.slice(6).replace(/[-_]/g, ' ').trim()}`
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      title={`${subject} · ${batch ? `${batch} · ` : ''}${timing} · ${room}`}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-sgvu-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold',
        slot.cancelled
          ? 'border-red-200 bg-red-50 text-red-900 opacity-80'
          : slot.is_virtual
          ? 'border-blue-200 bg-blue-50/70 text-blue-950'
          : 'border-sgvu-navy/10 bg-white text-sgvu-navy hover:bg-sgvu-navy/[0.03]',
      )}
    >
      <div className="w-[6.2rem] shrink-0 border-r border-sgvu-navy/10 pr-3 text-xs font-semibold leading-5">
        <span className="block">{to12h(slot.start_time)}</span>
        <span className="block text-muted-foreground">{to12h(slot.end_time)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{subject}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-muted-foreground">{slot.course_code}</span>
          {slot.is_extra_class && <Badge variant="outline">Approved extra class</Badge>}
          {batch && <Badge variant="secondary">{batch}</Badge>}
          {slot.cancelled && <Badge variant="destructive">Cancelled</Badge>}
          {slot.is_virtual && <Badge variant="outline">Online</Badge>}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{room}</span>
          {slot.faculty_name && <span>{slot.substitute_faculty_name ? 'Substitute' : 'Faculty'}: {slot.faculty_name}</span>}
        </p>
      </div>
    </button>
  );
}

export default function TimetablePage() {
  const api = useAuthedApi();
  const [requestedWeekStart, setRequestedWeekStart] = useState<string | undefined>(undefined);
  const [data, setData] = useState<WeekTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);

  const loadWeek = useCallback(
    async (start?: string) => {
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
        } else {
          setData(response);
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
    // Schedule the fetch after the effect's synchronous phase.
    void Promise.resolve().then(() => loadWeek(requestedWeekStart));
  }, [requestedWeekStart, loadWeek]);

  const weekDates = data?.week_dates ?? [];
  const slots = useMemo(() => data?.slots ?? [], [data?.slots]);

  const slotsByDay = useMemo(() => {
    const map = new Map<number, TimetableSlot[]>();
    for (const slot of slots) {
      const entries = map.get(slot.day_of_week) ?? [];
      entries.push(slot);
      map.set(slot.day_of_week, entries);
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.start_time.localeCompare(b.start_time)
        || a.course_code.localeCompare(b.course_code));
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
          Your classes by day. Only your confirmed practical batch is shown.
        </p>
      </section>

      <StudentSectionCard
        title="Your weekly schedule"
        description="Time, subject, practical batch, room and faculty"
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
              onClick={() => {
                if (data?.week_start) {
                  setLoading(true);
                  setRequestedWeekStart(shiftWeekStart(data.week_start, -1));
                }
              }}
              disabled={!data?.week_start}
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
              onClick={() => {
                if (data?.week_start) {
                  setLoading(true);
                  setRequestedWeekStart(shiftWeekStart(data.week_start, 1));
                }
              }}
              disabled={!data?.week_start}
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
            {Boolean(data?.pending_practical_batches?.length) && (
              <div className="mb-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Practical batch assignment pending</p>
                  <p className="mt-1">Your department must confirm your batch for {data?.pending_practical_batches?.map((course) => course.course_code).join(', ')}. We are not showing an unconfirmed lab as your class.</p>
                </div>
              </div>
            )}
            {Boolean(data?.conflict_count) && (
              <div className="mb-4 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950" role="alert">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p><strong>Published timetable conflict.</strong> Two confirmed sessions overlap. Please contact your department before attending or marking attendance.</p>
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {weekDates.map((day) => {
                const daySlots = slotsByDay.get(day.day_of_week) ?? [];
                return (
                  <section key={day.date} className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-slate-50/70">
                    <div className="flex items-center justify-between border-b border-sgvu-navy/10 bg-white px-4 py-3">
                      <h3 className="font-bold text-sgvu-navy">{day.label}, {formatDisplayDate(day.date)}</h3>
                      <span className="text-xs text-muted-foreground">{daySlots.length} {daySlots.length === 1 ? 'class' : 'classes'}</span>
                    </div>
                    <div className="space-y-2 p-3">
                      {daySlots.length ? daySlots.map((slot) => (
                        <SlotButton key={slot.timetable_id} slot={slot} onSelect={setSelectedSlot} />
                      )) : <p className="p-4 text-sm text-muted-foreground">No confirmed classes</p>}
                    </div>
                  </section>
                );
              })}
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
                {selectedSlot.cancelled && (
                  <p role="status" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    This class was cancelled. No attendance is expected for this session.
                  </p>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Course code</p>
                  <p className="font-semibold text-sgvu-navy">{selectedSlot.course_code}</p>
                </div>
                {selectedSlot.is_extra_class && <Badge variant="outline">Approved extra class</Badge>}
                {selectedSlot.section?.toUpperCase().startsWith('BATCH-') && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Practical group</p>
                    <p className="font-semibold text-sgvu-navy">{selectedSlot.section.replace('BATCH-', 'Batch ')}</p>
                  </div>
                )}
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
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{selectedSlot.substitute_faculty_name ? 'Substitute faculty' : 'Faculty'}</p>
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
