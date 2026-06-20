'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
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
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
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
import { getTimetableSlotStatus } from '@/lib/timetable-ist';

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

type TodayClass = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  start_time: string;
  end_time: string;
  student_count: number;
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
  const { courses, loading: coursesLoading, error: coursesError } = useFacultyCourses();
  const [schedule, setSchedule] = useState<TimetableRow[]>([]);
  const [stats, setStats] = useState<TimetableStats | null>(null);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    adjustment_type: 'EXTRA_CLASS',
    new_date: '',
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewAdjustment, setViewAdjustment] = useState<Adjustment | null>(null);

  async function loadPageData() {
    const [scheduleData, statsData, todayData, adjustmentData] = await Promise.all([
      api.get<TimetableRow[]>('/api/academics/faculty/workspaces/timetable'),
      api.get<TimetableStats>('/api/academics/faculty/workspaces/timetable/stats'),
      api.get<TodayClass[]>('/api/academics/faculty/timetable/today').catch(() => []),
      api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments'),
    ]);
    setSchedule(scheduleData);
    setStats(statsData);
    setTodayClasses(todayData);
    setAdjustments(adjustmentData);
  }

  useEffect(() => {
    void loadPageData().catch(() => undefined);
  }, [api]);

  const pendingAdjustments = useMemo(
    () => adjustments.filter((a) => a.status.includes('PENDING')),
    [adjustments],
  );

  const courseOptions = useMemo(() => courses, [courses]);

  async function submitAdjustment(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/api/academics/faculty/workspaces/adjustments', form);
      toast.success(
        'Schedule change submitted',
        {
          description:
            'Your request was sent to the HoD for approval. Students will be notified automatically once it is approved.',
        },
      );
      setForm({ course_id: '', adjustment_type: 'EXTRA_CLASS', new_date: '', reason: '' });
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
        title="Timetable & Extra Classes"
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

      <FacultyPanel title="Today's schedule" count={todayClasses.length}>
        {todayClasses.length === 0 ? (
          <FacultyEmptyState description="No classes scheduled for today." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {todayClasses.map((slot) => {
              const status = getTimetableSlotStatus(slot.start_time, slot.end_time);
              return (
                <div
                  key={slot.timetable_id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sgvu-navy">
                      {String(slot.start_time).slice(0, 5)}–{String(slot.end_time).slice(0, 5)}
                    </p>
                    <Badge variant={status === 'done' ? 'secondary' : status === 'ongoing' ? 'default' : 'outline'}>
                      {status === 'done' ? 'Done' : status === 'ongoing' ? 'Now' : 'Upcoming'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 font-medium">{slot.course_code}</p>
                  <p className="text-muted-foreground">{slot.course_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Room {slot.room ?? 'TBA'} · {slot.student_count} students
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <Link href={`/faculty/attendance?courseId=${slot.course_id}`}>
                      Mark attendance
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </FacultyPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <FacultyPanel title="Weekly schedule" count={schedule.length}>
          {schedule.length === 0 ? (
            <FacultyEmptyState description="No timetable rows assigned yet." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {schedule.map((s) => (
                <div
                  key={s.timetable_id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
                >
                  <p className="font-semibold text-sgvu-navy">
                    {DAYS[s.day_of_week]} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                  </p>
                  <p className="mt-0.5 font-medium">{s.course_code}</p>
                  <p className="text-muted-foreground">{s.course_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Room {s.room ?? 'TBA'}</p>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel title="Schedule change request" description="Extra class, cancel, or substitute">
          {coursesError && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {coursesError}
            </p>
          )}
          <form className="grid gap-3" onSubmit={submitAdjustment}>
            <select
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
            </select>
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={form.adjustment_type}
              onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}
            >
              <option value="EXTRA_CLASS">Extra class</option>
              <option value="CANCEL">Cancel class</option>
              <option value="SUSPENSION">Lecture suspension (day)</option>
              <option value="SUBSTITUTE">Substitute faculty</option>
              <option value="SUBSTITUTE">Substitute</option>
            </select>
            <Input
              type="datetime-local"
              value={form.new_date}
              onChange={(e) => setForm({ ...form, new_date: e.target.value })}
            />
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
      </div>

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
