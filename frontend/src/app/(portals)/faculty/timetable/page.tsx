'use client';

import { Select } from '@/components/ui/select';
import { PublishedTimetableGrid } from '@/components/faculty/PublishedTimetableGrid';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  MapPin,
  Timer,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
  FacultyEmptyState,
  FacultyStatCard,
  FacultyMetricChip,
} from '@/components/faculty';
import { useFacultyCourses, uniqueFacultyCoursesByCourseId } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import { ProxyTeachingDialog } from '@/components/faculty/ProxyTeachingDialog';
import { SessionChangePanel } from '@/components/faculty/SessionChangePanel';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoAdjustments,
  facultyDemoTimetable,
  facultyDemoTimetableStats,
} from '@/lib/mock/faculty-portal-demo';

/** Build a complete datetime value (browser rejects date-only / incomplete time). */
function toDateTimeLocalValue(datePart: string, timePart: string) {
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart}`;
}

const WEEK_DAYS = [
  { val: 1, label: 'Mon' },
  { val: 2, label: 'Tue' },
  { val: 3, label: 'Wed' },
  { val: 4, label: 'Thu' },
  { val: 5, label: 'Fri' },
  { val: 6, label: 'Sat' },
] as const;


function formatSlotTime(value: string) {
  const [hours = '0', minutes = '00'] = String(value).split(':');
  const hour = Number.parseInt(hours, 10);
  if (!Number.isFinite(hour)) return value;
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
}


type TimetableRow = {
  timetable_id: string;
  course_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  section?: string | null;
  awaiting_confirmation?: boolean;
  session_date?: string;
};

function addDays(day: string, count: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0,10);
}
function currentCampusWeek() {
  const today = new Intl.DateTimeFormat('en-CA',{
    timeZone: 'Asia/Kolkata',year: 'numeric',month: '2-digit',day: '2-digit',
  }).format(new Date());
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  return addDays(today,1 - weekday);
}

type Adjustment = {
  adjustment_id: string;
  adjustment_type: string;
  status: string;
  course_code: string;
  course_name: string;
  original_date: string | null;
  new_date: string | null;
  reason: string | null;
};

type ProxyOffer = {
  proxy_id: string;
  proxy_faculty_id: string;
  course_code: string;
  course_name: string;
  absent_faculty_name: string;
  date_of_proxy: string;
  status: string;
};

type TimetableStats = {
  term_start: string | null;
  weekly_slots: number;
  courses_taught: number;
  expected_so_far: number;
  conducted_classes: number;
  remaining_classes: number;
  completion_percent: number;
  todays_classes: number;
  todays_conducted: number;
  todays_remaining: number;
  missing_attendance_today: number;
  pending_adjustments: number;
  approved_adjustments: number;
  rejected_adjustments: number;
  approved_extra_classes: number;
  courses: {
    course_id: string;
    course_code: string;
    course_name: string;
    weekly_slots: number;
    expected_so_far: number;
    conducted_classes: number;
    remaining_classes: number;
    completion_percent: number;
  }[];
};

function formatTermStart(value: string | null) {
  if (!value) return 'this term';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function FacultyTimetablePage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const isObserver = Boolean(user?.read_only_academic_view);
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const { courses, loading: coursesLoading, error: coursesError } = useFacultyCourses();
  const [schedule, setSchedule] = useState<TimetableRow[]>([]);
  const [weekStart, setWeekStart] = useState(currentCampusWeek);
  const [datedSchedule, setDatedSchedule] = useState<TimetableRow[] | null>(null);
  const [datedError, setDatedError] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [stats, setStats] = useState<TimetableStats | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    adjustment_type: 'EXTRA_CLASS',
    date_part: '',
    time_part: '09:00',
    end_time: '10:00',
    timetable_id: '',
    room: '',
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extraSlotResult, setExtraSlotResult] = useState<{
    key: string;
    slots: Array<{ start_time: string; end_time: string;
      status: 'AVAILABLE' | 'CONFLICT' | 'REQUIRES_REVIEW'; reasons: string[] }>;
  } | null>(null);
  const [extraSlotError, setExtraSlotError] = useState<{ key: string; message: string } | null>(null);
  const [checkingExtraSlots, setCheckingExtraSlots] = useState(false);
  const [viewAdjustment, setViewAdjustment] = useState<Adjustment | null>(null);
  const [coverDate, setCoverDate] = useState('');
  const [proxyOffers, setProxyOffers] = useState<ProxyOffer[]>([]);
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const formDateTime = toDateTimeLocalValue(form.date_part, form.time_part);
  const extraDuration = form.end_time && form.time_part
    ? (Number(form.end_time.slice(0,2)) * 60 + Number(form.end_time.slice(3,5))) -
      (Number(form.time_part.slice(0,2)) * 60 + Number(form.time_part.slice(3,5)))
    : 0;
  const extraSlotsKey = `${form.timetable_id}|${form.date_part}|${form.room.trim()}|${extraDuration}`;

  useEffect(() => {
    if (form.adjustment_type !== 'EXTRA_CLASS' || !form.timetable_id || !form.date_part ||
        !form.room.trim() || extraDuration < 30 || extraDuration > 240 || extraDuration % 30 !== 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCheckingExtraSlots(true);
      const params = new URLSearchParams({
        timetable_id: form.timetable_id, target_date: form.date_part,
        target_room: form.room.trim(), duration_minutes: String(extraDuration),
      });
      try {
        const result = await api.get<{ slots: Array<{
          start_time: string; end_time: string;
          status: 'AVAILABLE' | 'CONFLICT' | 'REQUIRES_REVIEW'; reasons: string[];
        }> }>(`/api/academics/session-changes/extra-availability?${params}`);
        if (!cancelled) { setExtraSlotResult({ key: extraSlotsKey, slots: result.slots }); setExtraSlotError(null); }
      } catch (error) {
        if (!cancelled) setExtraSlotError({ key: extraSlotsKey,
          message: error instanceof Error ? error.message : 'Availability could not be verified' });
      } finally { if (!cancelled) setCheckingExtraSlots(false); }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api,form.adjustment_type,form.timetable_id,form.date_part,form.room,extraDuration,extraSlotsKey]);

  const loadPageData = useCallback(async () => {
    try {
      const [scheduleData, statsData, adjustmentData] = await Promise.all([
        api.get<TimetableRow[]>(withTeachingDeptId('/api/academics/faculty/workspaces/timetable', activeDeptId)),
        api.get<TimetableStats>(withTeachingDeptId('/api/academics/faculty/workspaces/timetable/stats', activeDeptId)),
        isObserver ? Promise.resolve([] as Adjustment[]) : api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments'),
      ]);
      setSchedule(withFacultyDemoFallback(scheduleData, facultyDemoTimetable(), isEmptyArray));
      setScheduleError(null);
      setStats(withFacultyDemoFallback(statsData, facultyDemoTimetableStats()));
      setAdjustments(withFacultyDemoFallback(adjustmentData, facultyDemoAdjustments(), isEmptyArray));
      if (!isObserver) {
        const offers = await api.get<ProxyOffer[]>('/api/academics/faculty/proxy-requests').catch(() => []);
        setProxyOffers(Array.isArray(offers) ? offers : []);
      }
    } catch {
      setScheduleError('Could not load the published timetable. Please retry; this does not mean there are no classes.');
      setSchedule(withFacultyDemoFallback([], facultyDemoTimetable(), isEmptyArray));
      setStats(withFacultyDemoFallback(null, facultyDemoTimetableStats()));
      setAdjustments(withFacultyDemoFallback([], facultyDemoAdjustments(), isEmptyArray));
    }
  }, [api, activeDeptId, isObserver]);

  useEffect(() => {
    if (deptLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPageData();
  }, [loadPageData, deptLoading]);

  useEffect(() => {
    if (deptLoading) return;
    let cancelled = false;
    const path = withTeachingDeptId(`/api/academics/faculty/attendance/week?start=${weekStart}`,activeDeptId);
    void api.get<Array<{ date: string; sessions: TimetableRow[] }>>(path)
      .then((days) => {
        if (cancelled) return;
        setDatedSchedule(days.flatMap((day) => day.sessions.map((session) => ({
          ...session,session_date: day.date,
          day_of_week: new Date(`${day.date}T00:00:00Z`).getUTCDay() || 7,
        }))));
        setDatedError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setDatedSchedule(null);
        setDatedError('The dated timetable could not be verified. No class-management actions should be based on this week until it reloads.');
      });
    return () => { cancelled = true; };
  }, [api,activeDeptId,deptLoading,weekStart]);

  const pendingAdjustments = useMemo(
    () => adjustments.filter((a) => a.status.includes('PENDING')),
    [adjustments],
  );

  const courseOptions = useMemo(
    () => uniqueFacultyCoursesByCourseId(courses),
    [courses],
  );
  const selectedSlot = useMemo(
    () => datedSchedule?.find((slot) => slot.timetable_id === selectedSlotId &&
      slot.session_date === selectedSessionDate) ?? null,
    [datedSchedule, selectedSlotId, selectedSessionDate],
  );
  const selectedIsBaseSession = Boolean(selectedSlot && schedule.some((base) =>
    base.timetable_id === selectedSlot.timetable_id &&
    base.day_of_week === selectedSlot.day_of_week &&
    base.start_time === selectedSlot.start_time &&
    base.end_time === selectedSlot.end_time && base.room === selectedSlot.room &&
    !base.awaiting_confirmation));
  const filteredWeek = useMemo(() => (datedSchedule ?? []).filter((slot) =>
    (!courseFilter || slot.course_code === courseFilter) &&
    (!sectionFilter || slot.section === sectionFilter)),
    [datedSchedule,courseFilter,sectionFilter]);


  async function submitAdjustment(e: FormEvent) {
    e.preventDefault();
    if (!form.course_id) {
      toast.error('Select a course first');
      return;
    }
    if (!form.date_part || !form.time_part) {
      toast.error('Enter both date and time for the schedule change');
      return;
    }
    const new_date = toDateTimeLocalValue(form.date_part, form.time_part);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(new_date)) {
      toast.error('Please enter a valid date and time');
      return;
    }
    if (form.adjustment_type === 'EXTRA_CLASS' &&
        (!form.timetable_id || !form.room.trim() || form.end_time <= form.time_part)) {
      toast.error('Choose an assigned section, room and an end time after the start');
      return;
    }
    if (form.adjustment_type === 'EXTRA_CLASS' &&
        !extraSlotResult?.slots.some((slot) => extraSlotResult.key === extraSlotsKey &&
          slot.status === 'AVAILABLE' && slot.start_time.slice(0,5) === form.time_part &&
          slot.end_time.slice(0,5) === form.end_time)) {
      toast.error('Select a verified available slot before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        course_id: form.course_id,
        adjustment_type: form.adjustment_type,
        new_date,
        reason: form.reason.trim() || undefined,
        ...(form.adjustment_type === 'EXTRA_CLASS' ? {
          timetable_id: form.timetable_id,
          session_date: form.date_part,
          start_time: form.time_part,
          end_time: form.end_time,
          room: form.room.trim(),
        } : {}),
      };

      // Smoke course IDs are not in Postgres — keep the request local and still show HoD flow.
      if (isFacultyDemoSmokeId(form.course_id)) {
        const course = courseOptions.find((c) => c.course_id === form.course_id);
        const demoRow: Adjustment = {
          adjustment_id: `adj-local-${Date.now()}`,
          adjustment_type: form.adjustment_type,
          status: 'PENDING_HOD_APPROVAL',
          course_code: course?.course_code ?? 'COURSE',
          course_name: course?.course_name ?? 'Course',
          original_date: null,
          new_date,
          reason: form.reason.trim() || null,
        };
        setAdjustments((prev) => [demoRow, ...prev]);
        toast.success('Schedule change submitted', {
          description:
            'Your request was sent to the department HoD for approval. Students will be notified automatically once it is approved.',
        });
        setForm({
          course_id: '',
          adjustment_type: 'EXTRA_CLASS',
          date_part: '',
          time_part: '09:00',
          end_time: '10:00',
          timetable_id: '',
          room: '',
          reason: '',
        });
        return;
      }

      await api.post('/api/academics/faculty/workspaces/adjustments', payload);
      toast.success('Schedule change submitted', {
        description:
          'Your request was sent to the department HoD for approval. Students will be notified automatically once it is approved.',
      });
      setForm({
        course_id: '',
        adjustment_type: 'EXTRA_CLASS',
        date_part: '',
        time_part: '09:00',
        end_time: '10:00',
        timetable_id: '',
        room: '',
        reason: '',
      });
      await loadPageData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      if (/pending request|pending schedule change/i.test(message)) {
        toast.warning('You already have a pending request', {
          description:
            'This course already has a schedule change waiting for HoD approval. Check "My pending requests" below — you can submit a new request after it is approved or rejected.',
          category: 'ACADEMICS',
          actionLabel: 'View pending requests',
          onAction: () => {
            document.getElementById('falcon-pending-requests')?.scrollIntoView({ behavior: 'smooth' });
          },
        });
      } else {
        toast.error(message, { category: 'ACADEMICS' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function answerProxyOffer(proxyId: string, action: 'ACCEPT' | 'DECLINE') {
    setOfferBusy(proxyId);
    try {
      await api.patch(`/api/academics/faculty/proxy-requests/${proxyId}/offer`, { action });
      setProxyOffers(await api.get<ProxyOffer[]>('/api/academics/faculty/proxy-requests'));
      toast.success(action === 'ACCEPT' ? 'Accepted. Waiting for HOD approval.' : 'Substitute offer declined.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not respond to substitute offer');
    } finally {
      setOfferBusy(null);
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Timetable"
        description="Weekly L-T-P schedule, teaching progress, and schedule change requests."
      />

      {stats ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FacultyStatCard
              label="Expected classes (term)"
              value={stats.expected_so_far}
              sub={`Since ${formatTermStart(stats.term_start)} · ${stats.weekly_slots} slots/week`}
              icon={CalendarCheck}
            />
            <FacultyStatCard
              label="Conducted"
              value={stats.conducted_classes}
              sub={`${stats.completion_percent}% complete`}
              icon={CheckCircle2}
              accent="gold"
            />
            <FacultyStatCard
              label="Remaining"
              value={stats.remaining_classes}
              sub="Expected minus attendance marked"
              icon={Timer}
            />
            <FacultyStatCard
              label="Today's classes"
              value={stats.todays_classes}
              sub={`${stats.todays_conducted} done · ${stats.todays_remaining} left`}
              icon={Clock}
              alert={stats.missing_attendance_today > 0}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FacultyMetricChip label="Courses" value={stats.courses_taught} />
            <FacultyMetricChip label="Weekly slots" value={stats.weekly_slots} />
            <FacultyMetricChip label="Pending requests" value={stats.pending_adjustments} emphasis={stats.pending_adjustments > 0} />
            <FacultyMetricChip label="Approved changes" value={stats.approved_adjustments} />
            <FacultyMetricChip label="Rejected" value={stats.rejected_adjustments} />
            <FacultyMetricChip label="Extra classes approved" value={stats.approved_extra_classes} />
            {stats.missing_attendance_today > 0 ? (
              <FacultyMetricChip label="Missing attendance today" value={stats.missing_attendance_today} emphasis />
            ) : null}
          </div>
        </>
      ) : null}

      <FacultyPanel
        title="Weekly schedule"
        count={filteredWeek.length}
        description="Published dated classes, including approved moves, substitutes and extra classes"
        contentClassName="p-0"
      >
        <div className="flex flex-wrap items-end gap-3 border-b bg-slate-50 px-4 py-3">
          <Button type="button" variant="outline" onClick={() => setWeekStart(addDays(weekStart,-7))}>Previous week</Button>
          <span className="text-sm font-semibold text-sgvu-navy">{weekStart} – {addDays(weekStart,6)}</span>
          <Button type="button" variant="outline" onClick={() => setWeekStart(addDays(weekStart,7))}>Next week</Button>
          <label className="grid gap-1 text-xs">Subject
            <Select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="">All subjects</option>
              {[...new Set((datedSchedule ?? []).map((slot) => slot.course_code))].sort().map((code) =>
                <option key={code} value={code}>{code}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs">Section
            <Select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              <option value="">All sections</option>
              {[...new Set((datedSchedule ?? []).map((slot) => slot.section).filter((value): value is string => !!value))].sort().map((section) =>
                <option key={section} value={section}>{section}</option>)}
            </Select>
          </label>
        </div>
        {scheduleError || datedError ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">{scheduleError || datedError}</p> : datedSchedule === null ? (
          <p role="status" className="p-4 text-sm">Loading this week’s published classes…</p>
        ) : filteredWeek.length === 0 ? (
          <div className="p-4 sm:p-5">
            <FacultyEmptyState
              description={
                courseOptions.length > 0
                  ? 'No published classes match this week and these filters.'
                  : 'No active courses or timetable slots are assigned yet.'
              }
            />
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-background px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy">
                  <BookOpen className="h-3.5 w-3.5" />
                </span>
                <span><strong className="text-sgvu-navy">{filteredWeek.length}</strong> classes in this dated week</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-sgvu-gold" />
                Published timetable
              </div>
            </div>

            <div className="divide-y divide-border/50 lg:hidden">
              {WEEK_DAYS.map((day) => {
                const dayEntries = filteredWeek
                  .filter((entry) => entry.day_of_week === day.val)
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <div key={day.val} className="grid gap-3 px-4 py-4 sm:grid-cols-[5rem_1fr] sm:px-5">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-sgvu-navy">{day.label}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                      </p>
                    </div>
                    {dayEntries.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                        No classes scheduled
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {dayEntries.map((entry) => (
                          <button key={`${entry.timetable_id}-${entry.session_date}`} type="button" onClick={() => { setSelectedSlotId(entry.timetable_id); setSelectedSessionDate(entry.session_date || null); }}
                            aria-pressed={selectedSlotId === entry.timetable_id}
                            className="w-full rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.035] p-3 text-left shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-sgvu-navy">{entry.course_code}</p>
                                <p className="mt-0.5 text-xs text-foreground/75">{entry.course_name}</p>
                              </div>
                              <span className="shrink-0 rounded-md bg-sgvu-gold/15 px-2 py-1 text-[10px] font-bold text-sgvu-navy">
                                {formatSlotTime(entry.start_time)}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatSlotTime(entry.start_time)}–{formatSlotTime(entry.end_time)}</span>
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.room ?? 'Room TBA'}</span>
                              <span>{entry.section || 'Whole course'} · {/(P|LAB)$/i.test(entry.course_code) ? 'Practical' : 'Class'}</span>
                              <span>{entry.awaiting_confirmation ? 'Awaiting department confirmation' : 'Published'}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="hidden min-w-0 lg:block"><PublishedTimetableGrid slots={filteredWeek} selectedId={selectedSlotId ?? undefined} onSelectSlot={(slot) => { setSelectedSlotId(slot.timetable_id); setSelectedSessionDate(slot.session_date || null); }} /></div>
              <aside className="border-t bg-slate-50 p-4 xl:border-l xl:border-t-0" aria-label="Selected class">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Selected class</p>
                {selectedSlot ? <div className="mt-3 space-y-2 text-sm">
                  <p className="font-bold text-sgvu-navy">{selectedSlot.course_code} · {selectedSlot.course_name}</p>
                  <p>{selectedSlot.section || 'Whole course'} · {selectedSlot.room || 'Room not mapped'}</p>
                  <p>{selectedSlot.session_date} · {formatSlotTime(selectedSlot.start_time)}–{formatSlotTime(selectedSlot.end_time)}</p>
                  <p className="text-xs text-muted-foreground">Changes are proposed for a specific date and require HOD approval.</p>
                  {!isObserver && selectedIsBaseSession && <Button type="button" size="sm" onClick={() => document.getElementById('falcon-manage-classes')?.scrollIntoView({ behavior: 'smooth' })}>Manage class</Button>}
                  {!isObserver && !selectedIsBaseSession && <p className="text-xs text-amber-800">This is a dated change or an unconfirmed slot. Choose an original published class to propose another change.</p>}
                </div> : <p className="mt-3 text-sm text-muted-foreground">Select a class on the timetable to view its details and available actions.</p>}
              </aside>
            </div>
          </div>
        )}
      </FacultyPanel>

      {!isObserver && <div className="grid gap-4 lg:grid-cols-2">
        <FacultyPanel title="Schedule change request" description="Extra class or cancellation — reviewed by HOD">
          {coursesError && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {coursesError}
            </p>
          )}
          <form className="grid gap-3" onSubmit={submitAdjustment}>
            <Select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value, timetable_id: '', room: '' })}
              required
              disabled={coursesLoading || courseOptions.length === 0}
            >
              <option value="">{coursesLoading ? 'Loading courses…' : 'Select course'}</option>
              {courseOptions.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </Select>
            {form.adjustment_type === 'EXTRA_CLASS' && <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-sgvu-navy">Student section / original class</span>
              <Select value={form.timetable_id} required onChange={(event) => {
                const selected = schedule.find((slot) => slot.timetable_id === event.target.value);
                setForm({ ...form, timetable_id: event.target.value, room: selected?.room || '' });
              }}>
                <option value="">Select the assigned section</option>
                {schedule.filter((slot) => slot.course_id === form.course_id && !!slot.section && !slot.awaiting_confirmation)
                  .map((slot) => <option key={slot.timetable_id} value={slot.timetable_id}>
                    {slot.section} · {WEEK_DAYS.find((day) => day.val === slot.day_of_week)?.label} · {formatSlotTime(slot.start_time)}–{formatSlotTime(slot.end_time)}
                  </option>)}
              </Select>
            </label>}
            <Select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.adjustment_type}
              onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}
            >
              <option value="EXTRA_CLASS">Extra class</option>
              <option value="CANCEL">Cancel class</option>
              <option value="SUSPENSION">Lecture suspension (day)</option>
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-sgvu-navy">Date</span>
                <Input
                  type="date"
                  required
                  value={form.date_part}
                  onChange={(e) => setForm({ ...form, date_part: e.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-sgvu-navy">Time</span>
                <Input
                  type="time"
                  required
                  value={form.time_part}
                  onChange={(e) => setForm({ ...form, time_part: e.target.value })}
                />
              </label>
              {form.adjustment_type === 'EXTRA_CLASS' && <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-sgvu-navy">End time</span>
                <Input type="time" required value={form.end_time}
                  onChange={(event) => setForm({ ...form, end_time: event.target.value })} />
              </label>}
            </div>
            {form.adjustment_type === 'EXTRA_CLASS' && <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-sgvu-navy">Room or laboratory</span>
              <Input required value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })}
                placeholder="Room with verified capacity" />
            </label>}
            {form.adjustment_type === 'EXTRA_CLASS' && <div className="rounded-lg border bg-slate-50 p-3" aria-label="Extra-class available slots">
              <p className="text-sm font-semibold text-sgvu-navy">Available slots</p>
              <p className="text-xs text-muted-foreground">Green is verified free; amber needs data review; red conflicts. A suggestion is not a reservation and HOD approval rechecks it.</p>
              {checkingExtraSlots && <p role="status" className="mt-2 text-sm">Checking student, faculty, room, exam and calendar availability…</p>}
              {extraSlotError?.key === extraSlotsKey && <p role="alert" className="mt-2 text-sm text-amber-900">{extraSlotError.message}</p>}
              {extraSlotResult?.key === extraSlotsKey && <div className="mt-3 grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
                {extraSlotResult.slots.map((slot) => <button key={slot.start_time} type="button"
                  disabled={slot.status !== 'AVAILABLE'}
                  onClick={() => setForm({ ...form, time_part: slot.start_time.slice(0,5), end_time: slot.end_time.slice(0,5) })}
                  className={`rounded-lg border p-2 text-left text-sm ${slot.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50' : slot.status === 'CONFLICT' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} ${slot.start_time.slice(0,5) === form.time_part ? 'ring-2 ring-sgvu-navy' : ''}`}>
                  <span className="font-semibold">{slot.start_time.slice(0,5)}–{slot.end_time.slice(0,5)}</span>
                  <span className="ml-2 text-xs">{slot.status === 'REQUIRES_REVIEW' ? 'Requires review' : slot.status === 'CONFLICT' ? 'Conflict' : 'Available'}</span>
                  {slot.reasons.map((reason, index) => <span key={index} className="mt-1 block text-xs">{reason}</span>)}
                </button>)}
              </div>}
            </div>}
            {formDateTime ? (
              <p className="text-xs text-muted-foreground">
                Scheduled for {new Date(formDateTime).toLocaleString('en-IN')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select both date and time — incomplete values are rejected by the browser.
              </p>
            )}
            <Input
              placeholder="Reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <Button type="submit" disabled={isSubmitting || courseOptions.length === 0}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for HoD approval'}
            </Button>
          </form>
        </FacultyPanel>

        <FacultyPanel id="falcon-pending-requests" title="My pending requests" count={pendingAdjustments.length}>
          {pendingAdjustments.length === 0 ? (
            <FacultyEmptyState description="No pending adjustment requests." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Requested date</th>
                    <th className="px-3 py-2">Course</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingAdjustments.map((a) => (
                    <tr key={a.adjustment_id} className="border-b border-border/40">
                      <td className="px-3 py-2.5">
                        {a.new_date ? new Date(a.new_date).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{a.course_code}</td>
                      <td className="px-3 py-2.5">{a.adjustment_type.replace('_', ' ')}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline">{a.status}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" variant="ghost" onClick={() => setViewAdjustment(a)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FacultyPanel>
      </div>}

      {!isObserver && <FacultyPanel
        title="Substitute a specific class"
        description="Propose a colleague for one dated class. They must accept, then your HOD approves. The weekly timetable remains unchanged."
      >
        <label className="grid max-w-xs gap-1.5 text-sm">
          <span className="font-medium text-sgvu-navy">Class date</span>
          <Input type="date" value={coverDate} onChange={(event) => setCoverDate(event.target.value)} />
        </label>
        {coverDate && <ProxyTeachingDialog
          startDate={coverDate}
          endDate={coverDate}
          reason="Faculty-requested class cover"
          onDone={() => { setCoverDate(''); void loadPageData(); }}
        />}
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-sgvu-navy">My substitute arrangements</p>
          {proxyOffers.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {proxyOffers.map((offer) => <div key={offer.proxy_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <span>{offer.course_code} · {String(offer.date_of_proxy).slice(0, 10)} · {offer.absent_faculty_name} · <strong>{offer.status.replaceAll('_', ' ')}</strong></span>
            {offer.proxy_faculty_id === user?.user_id && offer.status === 'PENDING_SUBSTITUTE_ACCEPTANCE' && <span className="flex gap-2">
              <Button size="sm" disabled={offerBusy === offer.proxy_id} onClick={() => void answerProxyOffer(offer.proxy_id, 'ACCEPT')}>Accept</Button>
              <Button size="sm" variant="outline" disabled={offerBusy === offer.proxy_id} onClick={() => void answerProxyOffer(offer.proxy_id, 'DECLINE')}>Decline</Button>
            </span>}
          </div>)}
        </div>
      </FacultyPanel>}

      {!isObserver && <div id="falcon-manage-classes"><SessionChangePanel key={`${selectedIsBaseSession ? selectedSlotId : 'default'}:${selectedIsBaseSession ? selectedSessionDate : ''}`} slots={schedule.filter((slot) => !slot.awaiting_confirmation)} selectedTimetableId={selectedIsBaseSession ? selectedSlotId ?? undefined : undefined} selectedSourceDate={selectedIsBaseSession ? selectedSessionDate ?? undefined : undefined} /></div>}

      <FacultyPanel title="Teaching progress by course" count={stats?.courses.length ?? 0}>
        {!stats || stats.courses.length === 0 ? (
          <FacultyEmptyState description="No course progress data yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Weekly slots</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Conducted</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Progress</th>
                </tr>
              </thead>
              <tbody>
                {stats.courses.map((course) => (
                  <tr key={course.course_id} className="border-b border-border/40">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{course.course_code}</p>
                      <p className="text-xs text-muted-foreground">{course.course_name}</p>
                    </td>
                    <td className="px-3 py-2.5">{course.weekly_slots}</td>
                    <td className="px-3 py-2.5">{course.expected_so_far}</td>
                    <td className="px-3 py-2.5">{course.conducted_classes}</td>
                    <td className="px-3 py-2.5">{course.remaining_classes}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-[120px] items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-sgvu-navy transition-all"
                            style={{ width: `${course.completion_percent}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums">{course.completion_percent}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FacultyPanel>

      <Dialog open={!!viewAdjustment} onOpenChange={(open) => !open && setViewAdjustment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request details</DialogTitle>
          </DialogHeader>
          {viewAdjustment && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Course:</span> {viewAdjustment.course_code} — {viewAdjustment.course_name}</p>
              <p><span className="font-medium">Type:</span> {viewAdjustment.adjustment_type.replace('_', ' ')}</p>
              <p><span className="font-medium">Status:</span> {viewAdjustment.status}</p>
              <p><span className="font-medium">Original date:</span> {viewAdjustment.original_date ? new Date(viewAdjustment.original_date).toLocaleString() : '—'}</p>
              <p><span className="font-medium">Requested date:</span> {viewAdjustment.new_date ? new Date(viewAdjustment.new_date).toLocaleString() : '—'}</p>
              <p><span className="font-medium">Reason:</span> {viewAdjustment.reason ?? '—'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
