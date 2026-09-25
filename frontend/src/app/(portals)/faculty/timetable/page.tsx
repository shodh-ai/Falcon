'use client';

import { Select } from '@/components/ui/select';
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
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
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

const GRID_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;

function formatGridTime(hour: number) {
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${ampm}`;
}

function formatSlotTime(value: string) {
  const [hours = '0', minutes = '00'] = String(value).split(':');
  const hour = Number.parseInt(hours, 10);
  if (!Number.isFinite(hour)) return value;
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function slotStartHour(start: string) {
  return Number.parseInt(String(start).slice(0, 2), 10);
}

type TimetableRow = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
};

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
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const { courses, loading: coursesLoading, error: coursesError } = useFacultyCourses();
  const [schedule, setSchedule] = useState<TimetableRow[]>([]);
  const [stats, setStats] = useState<TimetableStats | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    adjustment_type: 'EXTRA_CLASS',
    date_part: '',
    time_part: '09:00',
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewAdjustment, setViewAdjustment] = useState<Adjustment | null>(null);
  const formDateTime = toDateTimeLocalValue(form.date_part, form.time_part);

  const loadPageData = useCallback(async () => {
    try {
      const [scheduleData, statsData, adjustmentData] = await Promise.all([
        api.get<TimetableRow[]>(withTeachingDeptId('/api/academics/faculty/workspaces/timetable', activeDeptId)),
        api.get<TimetableStats>(withTeachingDeptId('/api/academics/faculty/workspaces/timetable/stats', activeDeptId)),
        api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments'),
      ]);
      setSchedule(withFacultyDemoFallback(scheduleData, facultyDemoTimetable(), isEmptyArray));
      setStats(withFacultyDemoFallback(statsData, facultyDemoTimetableStats()));
      setAdjustments(withFacultyDemoFallback(adjustmentData, facultyDemoAdjustments(), isEmptyArray));
    } catch {
      setSchedule(withFacultyDemoFallback([], facultyDemoTimetable(), isEmptyArray));
      setStats(withFacultyDemoFallback(null, facultyDemoTimetableStats()));
      setAdjustments(withFacultyDemoFallback([], facultyDemoAdjustments(), isEmptyArray));
    }
  }, [api, activeDeptId]);

  useEffect(() => {
    if (deptLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPageData();
  }, [loadPageData, deptLoading]);

  const pendingAdjustments = useMemo(
    () => adjustments.filter((a) => a.status.includes('PENDING')),
    [adjustments],
  );

  const courseOptions = useMemo(
    () => uniqueFacultyCoursesByCourseId(courses),
    [courses],
  );

  const slotsByDayHour = useMemo(() => {
    const map = new Map<string, TimetableRow[]>();
    for (const row of schedule) {
      const hour = slotStartHour(row.start_time);
      if (!Number.isFinite(hour)) continue;
      const key = `${row.day_of_week}|${hour}`;
      const existing = map.get(key) ?? [];
      existing.push(row);
      map.set(key, existing);
    }
    return map;
  }, [schedule]);

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

    setIsSubmitting(true);
    try {
      const payload = {
        course_id: form.course_id,
        adjustment_type: form.adjustment_type,
        new_date,
        reason: form.reason.trim() || undefined,
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
        count={schedule.length}
        description="Your published teaching plan for the week"
        contentClassName="p-0"
      >
        {schedule.length === 0 ? (
          <div className="p-4 sm:p-5">
            <FacultyEmptyState
              description={
                courseOptions.length > 0
                  ? 'Your course allocation is active. The department has not published timetable slots for these courses yet.'
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
                <span><strong className="text-sgvu-navy">{schedule.length}</strong> classes across {WEEK_DAYS.length} teaching days</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-sgvu-gold" />
                Published timetable
              </div>
            </div>

            <div className="divide-y divide-border/50 lg:hidden">
              {WEEK_DAYS.map((day) => {
                const dayEntries = schedule
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
                          <div key={entry.timetable_id} className="rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.035] p-3 shadow-sm">
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
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/25">
                    <th className="sticky left-0 z-20 w-[92px] border-r border-border/60 bg-muted/50 px-2 py-3 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Time
                    </th>
                    {WEEK_DAYS.map((day) => {
                      const dayCount = schedule.filter((entry) => entry.day_of_week === day.val).length;
                      return (
                        <th key={day.val} className="px-2 py-3 text-center">
                          <span className="block text-xs font-black uppercase tracking-[0.12em] text-sgvu-navy">{day.label}</span>
                          <span className="mt-0.5 block text-[9px] font-medium text-muted-foreground">
                            {dayCount === 0 ? 'No classes' : `${dayCount} ${dayCount === 1 ? 'class' : 'classes'}`}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {GRID_HOURS.map((hour) => {
                    if (hour === LUNCH_HOUR) {
                      return (
                        <tr key={`lunch-${hour}`} className="border-b border-border/50">
                          <td className="sticky left-0 z-10 border-r border-border/60 bg-muted/35 px-2 py-2 text-center text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {formatGridTime(hour)}
                          </td>
                          <td colSpan={WEEK_DAYS.length} className="bg-sgvu-gold/[0.07] px-2 py-2 text-center">
                            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sgvu-navy/65">
                              <span className="h-px w-8 bg-sgvu-gold/60" /> Lunch break <span className="h-px w-8 bg-sgvu-gold/60" />
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={hour} className="border-b border-border/45 last:border-b-0">
                        <td className="sticky left-0 z-10 border-r border-border/60 bg-muted/20 px-2 py-3 text-center text-[10px] font-bold tabular-nums text-sgvu-navy">
                          {formatGridTime(hour)}
                        </td>
                        {WEEK_DAYS.map((day) => {
                          const entries = slotsByDayHour.get(`${day.val}|${hour}`) ?? [];
                          return (
                            <td key={day.val} className="h-[88px] border-r border-border/35 bg-background p-1.5 align-top last:border-r-0">
                              {entries.length === 0 ? (
                                <div className="h-full rounded-lg transition-colors hover:bg-muted/20" />
                              ) : (
                                <div className="flex h-full flex-col gap-1.5">
                                  {entries.map((entry) => (
                                    <div
                                      key={entry.timetable_id}
                                      className="group relative flex h-full min-h-[74px] flex-col overflow-hidden rounded-lg border border-sgvu-navy/15 bg-sgvu-navy px-2.5 py-2 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                                    >
                                      <span className="absolute inset-y-0 left-0 w-1 bg-sgvu-gold" />
                                      <div className="flex items-start justify-between gap-2 pl-1">
                                        <p className="truncate text-[11px] font-black tracking-wide">{entry.course_code}</p>
                                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold tabular-nums text-white/85">
                                          {formatSlotTime(entry.start_time)}
                                        </span>
                                      </div>
                                      <p className="mt-1 line-clamp-2 pl-1 text-[10px] leading-snug text-white/80">{entry.course_name}</p>
                                      <div className="mt-auto flex items-center justify-between gap-2 pl-1 pt-1 text-[9px] text-white/65">
                                        <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{entry.room ?? 'Room TBA'}</span></span>
                                        <span className="shrink-0">to {formatSlotTime(entry.end_time)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </FacultyPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <FacultyPanel title="Schedule change request" description="Extra class, cancel, or substitute">
          {coursesError && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {coursesError}
            </p>
          )}
          <form className="grid gap-3" onSubmit={submitAdjustment}>
            <Select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
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
            <Select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.adjustment_type}
              onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}
            >
              <option value="EXTRA_CLASS">Extra class</option>
              <option value="CANCEL">Cancel class</option>
              <option value="SUSPENSION">Lecture suspension (day)</option>
              <option value="SUBSTITUTE">Substitute faculty</option>
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
            </div>
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
      </div>

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
