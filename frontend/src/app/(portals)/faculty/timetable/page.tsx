'use client';

import { Select } from '@/components/ui/select';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PublishedTimetableGrid, type PublishedSlot } from '@/components/faculty/PublishedTimetableGrid';
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
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  faculty_user_id?: string | null;
  section?: string | null;
  awaiting_confirmation?: boolean;
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
  proposed_room?: string | null;
};

type DatedMove = { move_id: string; source_timetable_id: string; source_date: string; target_date: string; target_start_time: string; target_end_time: string; target_room: string | null; course_code: string; course_name: string; status: string; requested_by_user_id: string; original_faculty_id: string };

type ExtraClassSlot = { date: string; start_time: string; end_time: string; status: 'AVAILABLE' | 'CONFLICT' | 'REQUIRES_REVIEW'; reasons: string[]; room: string | null };

type ProxyOffer = {
  proxy_id: string;
  absent_faculty_id: string;
  proxy_faculty_id: string;
  course_code: string;
  course_name: string;
  absent_faculty_name: string;
  proxy_faculty_name: string;
  department_hod_name?: string | null;
  date_of_proxy: string;
  class_date?: string;
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
  const teachingPrefix = usePathname()?.startsWith('/hod/my-teaching/') ? '/hod/my-teaching' : '/faculty';
  const api = useAuthedApi();
  const { user } = useAuth();
  const isObserver = Boolean(user?.read_only_academic_view);
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const { courses, loading: coursesLoading, error: coursesError } = useFacultyCourses();
  const [schedule, setSchedule] = useState<TimetableRow[]>([]);
  const [courseFilter, setCourseFilter] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [suggestions, setSuggestions] = useState<ExtraClassSlot[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [stats, setStats] = useState<TimetableStats | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [datedMoves, setDatedMoves] = useState<DatedMove[]>([]);
  const [form, setForm] = useState({
    course_id: '',
    adjustment_type: 'EXTRA_CLASS',
    date_part: '',
    time_part: '09:00',
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewAdjustment, setViewAdjustment] = useState<Adjustment | null>(null);
  const [coverDate, setCoverDate] = useState('');
  const [manageAction, setManageAction] = useState<'adjust' | 'substitute' | 'swap' | null>(null);
  const [proxyOffers, setProxyOffers] = useState<ProxyOffer[]>([]);
  const [proxyLoading, setProxyLoading] = useState(true);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const [cancellingCoverId, setCancellingCoverId] = useState<string | null>(null);
  const [cancelCoverReason, setCancelCoverReason] = useState('');
  const formDateTime = toDateTimeLocalValue(form.date_part, form.time_part);

  const loadProxyOffers = useCallback(async () => {
    if (isObserver) return;
    setProxyLoading(true);
    try {
      const offers = await api.get<ProxyOffer[]>('/api/academics/faculty/proxy-requests');
      if (!Array.isArray(offers)) throw new Error('The substitute inbox returned an invalid response');
      setProxyOffers(offers);
      setProxyError(null);
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : 'Could not load substitute offers');
    } finally {
      setProxyLoading(false);
    }
  }, [api, isObserver]);

  const loadPageData = useCallback(async () => {
    try {
      const [scheduleData, statsData, adjustmentData, movesData] = await Promise.all([
        api.get<TimetableRow[]>(withTeachingDeptId('/api/academics/faculty/workspaces/timetable', activeDeptId)),
        api.get<TimetableStats>(withTeachingDeptId('/api/academics/faculty/workspaces/timetable/stats', activeDeptId)),
        isObserver ? Promise.resolve([] as Adjustment[]) : api.get<Adjustment[]>('/api/academics/faculty/workspaces/adjustments'),
        isObserver ? Promise.resolve([] as DatedMove[]) : api.get<DatedMove[]>('/api/academics/session-changes/mine').catch(() => [] as DatedMove[]),
      ]);
      setSchedule(withFacultyDemoFallback(scheduleData, facultyDemoTimetable(), isEmptyArray));
      setScheduleError(null);
      setStats(withFacultyDemoFallback(statsData, facultyDemoTimetableStats()));
      setAdjustments(withFacultyDemoFallback(adjustmentData, facultyDemoAdjustments(), isEmptyArray));
      setDatedMoves(Array.isArray(movesData) ? movesData : []);
    } catch {
      setScheduleError('Could not load the published timetable. Please retry; this does not mean there are no classes.');
      setSchedule(withFacultyDemoFallback([], facultyDemoTimetable(), isEmptyArray));
      setStats(withFacultyDemoFallback(null, facultyDemoTimetableStats()));
      setAdjustments(withFacultyDemoFallback([], facultyDemoAdjustments(), isEmptyArray));
      setDatedMoves([]);
    }
  }, [api, activeDeptId, isObserver]);

  useEffect(() => {
    if (deptLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPageData();
  }, [loadPageData, deptLoading]);

  useEffect(() => {
    if (isObserver) return;
    queueMicrotask(() => void loadProxyOffers());
    const timer = window.setInterval(() => void loadProxyOffers(), 30_000);
    return () => window.clearInterval(timer);
  }, [isObserver, loadProxyOffers]);

  const incomingOffers = useMemo(
    () => proxyOffers.filter((offer) => offer.proxy_faculty_id === user?.user_id),
    [proxyOffers, user?.user_id],
  );
  const mySubstituteRequests = useMemo(
    () => proxyOffers.filter((offer) => offer.absent_faculty_id === user?.user_id),
    [proxyOffers, user?.user_id],
  );
  const pendingSwapOffers = useMemo(() => datedMoves.filter((move) =>
    move.status === 'PENDING_FACULTY_ACCEPTANCE' &&
    move.original_faculty_id === user?.user_id && move.requested_by_user_id !== user?.user_id),
  [datedMoves, user?.user_id]);

  const pendingAdjustments = useMemo(
    () => adjustments.filter((a) => a.status.includes('PENDING')),
    [adjustments],
  );

  const courseOptions = useMemo(
    () => uniqueFacultyCoursesByCourseId(courses),
    [courses],
  );
  const scheduleCourses = useMemo(
    () => [...new Map(schedule.map((slot) => [slot.course_code, slot.course_name])).entries()].sort(([a], [b]) => a.localeCompare(b)),
    [schedule],
  );
  const scheduleSections = useMemo(
    () => [...new Set(schedule.map((slot) => slot.section).filter((section): section is string => Boolean(section)))].sort(),
    [schedule],
  );
  const visibleSchedule = useMemo(
    () => schedule.filter((slot) => (!courseFilter || slot.course_code === courseFilter) && (!sectionFilter || slot.section === sectionFilter)),
    [schedule, courseFilter, sectionFilter],
  );
  const weekStart = useMemo(() => {
    const today = new Date();
    const monday = new Date(today.getFullYear(),today.getMonth(),today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
    return monday;
  }, [weekOffset]);
  const gridSlots = useMemo<PublishedSlot[]>(() => {
    const weekEnd = new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate() + 6);
    const inWeek = (value: string | null) => {
      if (!value) return false;
      const date = new Date(value);
      return date >= weekStart && date < new Date(weekEnd.getFullYear(),weekEnd.getMonth(),weekEnd.getDate() + 1);
    };
    const approved = adjustments.filter(row => row.status === 'APPROVED' && inWeek(row.new_date));
    const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const moved = datedMoves.filter(move => move.status === 'APPROVED');
    const updated: PublishedSlot[] = visibleSchedule.filter(slot => {
      const occurrence = isoDate(new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate() + slot.day_of_week - 1));
      return !moved.some(move => move.source_timetable_id === slot.timetable_id && String(move.source_date).slice(0,10) === occurrence);
    }).map(slot => {
      const cancellation = approved.find(row => row.adjustment_type === 'CANCEL' && row.course_code === slot.course_code &&
        new Date(row.new_date!).getDay() === slot.day_of_week % 7 &&
        new Date(row.new_date!).getHours() === Number(slot.start_time.slice(0,2)));
      return { ...slot, display_status: cancellation ? 'CANCELLED' as const : undefined };
    });
    for (const row of approved.filter(item => item.adjustment_type === 'EXTRA_CLASS')) {
      if (courseFilter && row.course_code !== courseFilter) continue;
      const date = new Date(row.new_date!);
      updated.push({ timetable_id: `extra-${row.adjustment_id}`, day_of_week: date.getDay() || 7,
        start_time: `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`,
        end_time: `${String(date.getHours() + 1).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`,
        course_code: row.course_code, course_name: row.course_name, room: row.proposed_room ?? null,
        section: null, display_status: 'EXTRA_CLASS' });
    }
    for (const move of moved.filter(item => inWeek(item.target_date))) {
      if (courseFilter && move.course_code !== courseFilter) continue;
      const target = new Date(`${String(move.target_date).slice(0,10)}T12:00:00`);
      updated.push({ timetable_id: `moved-${move.move_id}`, day_of_week: target.getDay() || 7,
        start_time: move.target_start_time, end_time: move.target_end_time,
        room: move.target_room, course_code: move.course_code, course_name: move.course_name,
        section: null, display_status: 'RESCHEDULED' });
    }
    return updated;
  }, [visibleSchedule, adjustments, datedMoves, weekStart, courseFilter]);
  const selectedSlot = gridSlots.find((slot) => slot.timetable_id === selectedSlotId) ?? null;

  useEffect(() => {
    if (form.adjustment_type !== 'EXTRA_CLASS' || !form.course_id || !form.date_part || isFacultyDemoSmokeId(form.course_id)) {
      setSuggestions([]); setSuggestionsError(null); setSelectedRoom(null); return;
    }
    let active = true;
    setSuggestionsLoading(true); setSuggestionsError(null); setSuggestions([]); setSelectedRoom(null);
    void api.get<ExtraClassSlot[]>(`/api/academics/faculty/workspaces/adjustments/extra-class-slots?courseId=${encodeURIComponent(form.course_id)}&date=${encodeURIComponent(form.date_part)}`)
      .then(rows => { if (active) setSuggestions(Array.isArray(rows) ? rows : []); })
      .catch(reason => { if (active) setSuggestionsError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setSuggestionsLoading(false); });
    return () => { active = false; };
  }, [api, form.adjustment_type, form.course_id, form.date_part]);


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

    if (form.adjustment_type === 'EXTRA_CLASS' && !isFacultyDemoSmokeId(form.course_id) &&
        !suggestions.some(slot => slot.status === 'AVAILABLE' && slot.start_time === form.time_part && slot.room === selectedRoom)) {
      toast.error('Choose an available suggested slot and room first');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        course_id: form.course_id,
        adjustment_type: form.adjustment_type,
        new_date: `${new_date}+05:30`,
        proposed_room: form.adjustment_type === 'EXTRA_CLASS' ? selectedRoom : undefined,
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

  async function answerProxyOffer(proxyId: string, action: 'ACCEPT' | 'DECLINE') {
    setOfferBusy(proxyId);
    try {
      await api.patch(`/api/academics/faculty/proxy-requests/${proxyId}/offer`, { action });
      await loadProxyOffers();
      toast.success(action === 'ACCEPT' ? 'Accepted. HOD approval is still required before you can mark attendance.' : 'Substitute offer declined.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not respond to substitute offer');
    } finally {
      setOfferBusy(null);
    }
  }

  async function cancelMyCover(proxyId: string) {
    if (!cancelCoverReason.trim()) { toast.error('Enter a reason for cancelling the substitute offer'); return; }
    setOfferBusy(proxyId);
    try {
      await api.patch(`/api/academics/faculty/proxy-requests/${proxyId}/cancel`, { reason: cancelCoverReason.trim() });
      await loadProxyOffers();
      setCancellingCoverId(null); setCancelCoverReason('');
      toast.success('Pending substitute offer cancelled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not cancel substitute offer');
    } finally { setOfferBusy(null); }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title={teachingPrefix === '/hod/my-teaching' ? 'My Teaching Timetable' : 'Timetable'}
        description="Your own teaching sessions, substitute offers, and approved changes."
        actions={<>
          {teachingPrefix === '/hod/my-teaching' && <Button asChild variant="outline" size="sm"><Link href="/hod/department-timetable">Department timetable</Link></Button>}
          <Button asChild variant="outline" size="sm"><Link href={`${teachingPrefix}/workload`}>View my workload</Link></Button>
        </>}
      />

      <FacultyPanel
        title="Weekly schedule"
        count={schedule.length}
        description="Your recurring published teaching plan. Select a class to see its details and available actions."
        contentClassName="p-0"
      >
        {scheduleError ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">{scheduleError}</p> : schedule.length === 0 ? (
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
                <span><strong className="text-sgvu-navy">{visibleSchedule.length}</strong> of {schedule.length} weekly classes</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-sgvu-gold" />
                Published timetable
              </div>
            </div>

            <div className="grid gap-3 border-b border-border/50 bg-muted/20 px-4 py-3 sm:grid-cols-2 sm:px-5">
              <label className="grid gap-1 text-xs font-semibold text-sgvu-navy">Course
                <Select value={courseFilter} onChange={(event) => { setCourseFilter(event.target.value); setSelectedSlotId(null); }}>
                  <option value="">All courses</option>
                  {scheduleCourses.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                </Select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-sgvu-navy">Section
                <Select value={sectionFilter} onChange={(event) => { setSectionFilter(event.target.value); setSelectedSlotId(null); }}>
                  <option value="">All sections</option>
                  {scheduleSections.map((section) => <option key={section} value={section}>{section}</option>)}
                </Select>
              </label>
            </div>

            {visibleSchedule.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No published classes match these filters.</p> : <div>
              <div className="min-w-0">

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <button type="button" className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50" onClick={() => { setWeekOffset(value => value - 1); setSelectedSlotId(null); }} aria-label="Previous week">← Previous</button>
              <span className="text-sm font-semibold text-sgvu-navy">{weekStart.toLocaleDateString('en-IN',{ day:'numeric',month:'short' })} – {new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+5).toLocaleDateString('en-IN',{ day:'numeric',month:'short',year:'numeric' })}</span>
              <button type="button" className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50" onClick={() => { setWeekOffset(value => value + 1); setSelectedSlotId(null); }} aria-label="Next week">Next →</button>
            </div>
            <PublishedTimetableGrid slots={gridSlots} weekStart={weekStart} selectedId={selectedSlotId} onSelect={(slot) => setSelectedSlotId(slot.timetable_id)} />
              </div>
              {selectedSlot && <aside className="border-t border-border/50 bg-slate-50/70 p-4" aria-label="Selected class details">
                <h3 className="text-sm font-bold text-sgvu-navy">Selected class</h3>
                {selectedSlot ? <div className="mt-3 space-y-3 text-sm">
                  <div><p className="font-bold text-sgvu-navy">{selectedSlot.course_name}</p><p className="text-xs text-muted-foreground">{selectedSlot.course_code}</p></div>
                  <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-2 text-xs">
                    <dt className="text-muted-foreground">Day</dt><dd>{WEEK_DAYS.find((day) => day.val === selectedSlot.day_of_week)?.label ?? 'Sun'}</dd>
                    <dt className="text-muted-foreground">Time</dt><dd>{formatSlotTime(selectedSlot.start_time)}–{formatSlotTime(selectedSlot.end_time)}</dd>
                    <dt className="text-muted-foreground">Section</dt><dd>{selectedSlot.section || 'Whole course'}</dd>
                    <dt className="text-muted-foreground">Room</dt><dd>{selectedSlot.room || 'Not specified'}</dd>
                    <dt className="text-muted-foreground">Status</dt><dd>{selectedSlot.display_status === 'CANCELLED' ? 'Cancelled for this date' : selectedSlot.display_status === 'EXTRA_CLASS' ? 'Approved extra class' : selectedSlot.display_status === 'RESCHEDULED' ? 'Approved moved class' : selectedSlot.awaiting_confirmation ? 'Awaiting department confirmation' : 'Published'}</dd>
                  </dl>
                  {!isObserver && selectedSlot.display_status !== 'CANCELLED' && <div className="flex flex-wrap gap-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">Class changes require HOD approval. Selecting a class does not reserve a new slot.</p>
                    <Button size="sm" onClick={() => { setManageAction('substitute'); document.getElementById('faculty-manage-classes')?.scrollIntoView({ behavior: 'smooth' }); }}>Arrange substitute</Button>
                    <Button size="sm" variant="outline" onClick={() => { setManageAction('swap'); document.getElementById('faculty-manage-classes')?.scrollIntoView({ behavior: 'smooth' }); }}>Swap classes</Button>
                  </div>}
                </div> : <p className="mt-3 text-xs text-muted-foreground">Choose a class in the timetable to see its details.</p>}
              </aside>}
            </div>}
          </div>
        )}
      </FacultyPanel>


      {!isObserver && (proxyError || incomingOffers.some((offer) => offer.status.startsWith('PENDING_'))) && <section id="substitute-offers" aria-label="Substitute offers for you" className="overflow-hidden rounded-2xl border border-sgvu-navy/15 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sgvu-navy/10 bg-sgvu-navy/[0.035] px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-bold text-sgvu-navy">Substitute offers for you</h2>
            <p className="mt-1 text-sm text-muted-foreground">Accept or decline a colleague&apos;s request here. After you accept, the HOD must approve it before the class appears in Mark Attendance.</p>
          </div>
          <Button size="sm" variant="outline" disabled={proxyLoading} onClick={() => void loadProxyOffers()}>
            {proxyLoading ? 'Refreshing…' : 'Refresh offers'}
          </Button>
        </div>
        <div className="space-y-3 p-4 sm:p-5" aria-live="polite">
          {proxyError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Could not load substitute offers: {proxyError}. Use Refresh offers to retry.</div>}
          {proxyLoading && incomingOffers.length === 0 && !proxyError && <p className="text-sm text-muted-foreground">Loading your offers…</p>}
          {!proxyLoading && !proxyError && incomingOffers.length === 0 && <p className="text-sm text-muted-foreground">No colleague has offered you a class to cover yet.</p>}
          {incomingOffers.map((offer) => <div key={offer.proxy_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sgvu-navy/10 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-sgvu-navy">{offer.course_code} · {offer.course_name}</p>
              <p className="text-sm text-muted-foreground">{offer.class_date ?? String(offer.date_of_proxy).slice(0, 10)} · For {offer.absent_faculty_name}</p>
              <p className="mt-1 text-xs font-medium text-sgvu-navy">{offer.status === 'PENDING_SUBSTITUTE_ACCEPTANCE' ? 'Your response is needed' : offer.status === 'PENDING_HOD_APPROVAL' ? 'Accepted · awaiting HOD approval' : offer.status === 'APPROVED' ? 'Approved · attendance access is active for this class' : offer.status.replaceAll('_', ' ')}</p>
            </div>
            {offer.status === 'PENDING_SUBSTITUTE_ACCEPTANCE' && <div className="flex gap-2">
              <Button size="sm" disabled={offerBusy === offer.proxy_id} onClick={() => void answerProxyOffer(offer.proxy_id, 'ACCEPT')}>Accept class</Button>
              <Button size="sm" variant="outline" disabled={offerBusy === offer.proxy_id} onClick={() => void answerProxyOffer(offer.proxy_id, 'DECLINE')}>Decline</Button>
            </div>}
            {offer.status === 'APPROVED' && <Link href={`${teachingPrefix}/attendance`} className="rounded-lg bg-sgvu-navy px-3 py-2 text-sm font-semibold text-white">Mark attendance</Link>}
          </div>)}
          <p className="text-xs text-muted-foreground">Request sent → Substitute accepts → HOD approves → Attendance access opens for that dated class.</p>
        </div>
      </section>}

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


      {!isObserver && <section id="faculty-manage-classes" className="rounded-xl border bg-white p-4 shadow-sm" aria-label="Manage classes">
        <h2 className="font-bold text-sgvu-navy">Manage classes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose one action. Requests stay separate from the published weekly timetable until approved.</p>
        {mySubstituteRequests.filter((offer) => offer.status === 'APPROVED' || offer.status.startsWith('PENDING_')).length > 0 &&
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Active class cover</p>
            <p className="text-xs">A pending or approved cover blocks swapping that dated class until it is resolved.</p>
            <div className="mt-2 space-y-2">{mySubstituteRequests.filter((offer) => offer.status === 'APPROVED' || offer.status.startsWith('PENDING_')).map((offer) =>
              <div key={offer.proxy_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white p-2">
                <span>{offer.course_code} · {String(offer.date_of_proxy).slice(0, 10)} · {offer.proxy_faculty_name} · {offer.status.replaceAll('_', ' ')}</span>
                {offer.status.startsWith('PENDING_') ? cancellingCoverId === offer.proxy_id ? <div className="flex flex-wrap gap-2">
                  <Input aria-label="Cancellation reason" placeholder="Reason for cancellation" value={cancelCoverReason} onChange={(event) => setCancelCoverReason(event.target.value)} />
                  <Button size="sm" disabled={offerBusy === offer.proxy_id || !cancelCoverReason.trim()} onClick={() => void cancelMyCover(offer.proxy_id)}>Confirm cancellation</Button>
                  <Button size="sm" variant="outline" onClick={() => { setCancellingCoverId(null); setCancelCoverReason(''); }}>Keep offer</Button>
                </div> : <Button size="sm" variant="outline" onClick={() => { setCancellingCoverId(offer.proxy_id); setCancelCoverReason(''); }}>Cancel offer</Button> :
                  <span className="text-xs">{offer.department_hod_name || 'Your department HOD'} can withdraw approved cover in Class cover.</span>}
              </div>)}</div>
          </div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant={manageAction === 'substitute' ? 'default' : 'outline'} onClick={() => setManageAction(manageAction === 'substitute' ? null : 'substitute')}>Arrange substitute</Button>
          <Button size="sm" variant={manageAction === 'swap' ? 'default' : 'outline'} onClick={() => setManageAction(manageAction === 'swap' ? null : 'swap')}>
            Swap classes{pendingSwapOffers.length ? ` · ${new Set(pendingSwapOffers.map((move) => move.source_timetable_id)).size} response needed` : ''}
          </Button>
          <Button size="sm" variant={manageAction === 'adjust' ? 'default' : 'outline'} onClick={() => setManageAction(manageAction === 'adjust' ? null : 'adjust')}>Extra or cancel class</Button>
        </div>
      </section>}

      {!isObserver && <div className="grid gap-4">
        {manageAction === 'adjust' && <FacultyPanel title="Schedule change request" description="Extra or cancel class">
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
            {form.adjustment_type === 'EXTRA_CLASS' && form.course_id && form.date_part && !isFacultyDemoSmokeId(form.course_id) && <section className="rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Suggested extra class slots">
              <h3 className="text-sm font-bold text-sgvu-navy">Choose a verified slot</h3>
              <p className="mb-3 text-xs text-muted-foreground">Checks faculty, enrolled students, exams, academic day and room. Cancelled classes free their original hour. HOD rechecks before approval.</p>
              {suggestionsLoading && <p className="text-sm">Checking available times…</p>}
              {suggestionsError && <p className="text-sm text-rose-700">{suggestionsError}</p>}
              <div className="grid gap-2 sm:grid-cols-3">
                {suggestions.map(slot => <button type="button" key={slot.start_time}
                  disabled={slot.status !== 'AVAILABLE'}
                  onClick={() => { setForm(current => ({ ...current, time_part: slot.start_time })); setSelectedRoom(slot.room); }}
                  aria-pressed={slot.status === 'AVAILABLE' && form.time_part === slot.start_time && selectedRoom === slot.room}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${slot.status === 'AVAILABLE' ? 'border-emerald-200 bg-emerald-50 hover:ring-2 hover:ring-emerald-300' : slot.status === 'CONFLICT' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'} ${form.time_part === slot.start_time && selectedRoom === slot.room && slot.status === 'AVAILABLE' ? 'ring-2 ring-emerald-500' : ''}`}>
                  <span className="block font-bold">{formatSlotTime(slot.start_time)} – {formatSlotTime(slot.end_time)}</span>
                  <span className="block">{slot.status === 'AVAILABLE' ? `Available · ${slot.room}` : slot.status === 'CONFLICT' ? 'Conflict' : 'Requires review'}</span>
                  {slot.reasons.length > 0 && <span className="mt-1 block text-[11px]">{slot.reasons.join('; ')}</span>}
                </button>)}
              </div>
              {!suggestionsLoading && suggestions.length > 0 && !suggestions.some(slot => slot.status === 'AVAILABLE') && <p className="mt-2 text-xs text-amber-900">No fully verified slot on this date. Choose another date or ask your HOD to complete missing timetable, roster or room data.</p>}
            </section>}
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
            <Button type="submit" disabled={isSubmitting || courseOptions.length === 0 || (form.adjustment_type === 'EXTRA_CLASS' && !isFacultyDemoSmokeId(form.course_id) && !selectedRoom)}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit for HoD approval'}
            </Button>
          </form>
        </FacultyPanel>}

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

      {!isObserver && manageAction === 'substitute' && <FacultyPanel
        id="faculty-substitute-class"
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
          onDone={() => { setCoverDate(''); void loadProxyOffers(); void loadPageData(); }}
        />}
      </FacultyPanel>}

      {!isObserver && manageAction === 'swap' && <div id="faculty-swap-classes"><SessionChangePanel slots={schedule.filter((slot) =>
        !slot.awaiting_confirmation && (!slot.faculty_user_id || slot.faculty_user_id === user?.user_id))} /></div>}

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
