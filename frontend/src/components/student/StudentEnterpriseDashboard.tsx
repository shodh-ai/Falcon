'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  GraduationCap,
  IdCard,
  LifeBuoy,
  MapPin,
  Sparkles,
  Ticket,
  UserRoundCheck,
  UserRoundCog,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { NoticeBoardWidget } from '@/components/dashboard/NoticeBoardWidget';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentIdCardDialog } from '@/components/student/StudentIdCardDialog';
import { StudentAvatar } from '@/components/student/StudentAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNotificationHistory, toAppNotification } from '@/hooks/useNotifications';
import { notificationsApi } from '@/lib/api/notifications';
import { handleNotificationAction } from '@/lib/notifications/notification-actions';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import type { PlacementHub } from '@/lib/placement';
import {
  DEMO_ASSIGNMENTS,
  DEMO_DASHBOARD_METRICS,
  DEMO_EXAMS,
  DEMO_PLACEMENTS,
  DEMO_STUDENT,
  DEMO_TODAY_SCHEDULE,
  isDemoNotificationId,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import {
  getIstMinutesNow,
  getTimetableSlotStatus,
  timeStringToMinutes,
} from '@/lib/timetable-ist';

type Summary = {
  cgpa: number;
  credits_completed: number;
  credits_required: number;
  attendance_percent: number;
};

type Profile = {
  name?: string;
  enrollment_no?: string;
  program?: string;
  branch?: string;
  semester?: number;
  session?: string | null;
  profile_photo_url?: string | null;
};

type Ledger = {
  demands?: Array<{ status?: string; amount?: number; payable_amount?: number }>;
  pending_demands?: Array<{
    status?: string;
    amount?: number;
    payable_amount?: number;
  }>;
  fee_structure?: Array<{
    status?: string;
    amount?: number;
    payable_amount?: number;
  }>;
  total_outstanding?: number;
  gates?: {
    finance_clear?: boolean;
    admit_card_locked?: boolean;
    no_dues_blocked?: boolean;
  };
};

type ExamDesk = {
  upcoming_exams?: Array<{
    subject?: string;
    course_name?: string;
    exam_date?: string;
    date?: string;
    start_time?: string;
    time?: string;
    hall?: string;
    room?: string;
  }>;
  admit_cards?: unknown[];
};

type ScheduleItem = {
  id: string;
  subject: string;
  faculty: string;
  room: string;
  start: string;
  end: string;
  status: 'upcoming' | 'ongoing' | 'done';
};

type AssignmentItem = {
  id: string;
  subject: string;
  title: string;
  dueAt: string;
  courseId?: string;
  status: 'Pending' | 'Due soon' | 'Submitted';
};

const QUICK_ACTIONS = [
  { label: 'View ID Card', action: 'id-card' as const, icon: IdCard },
  { label: 'My Profile', href: '/student/profile', icon: UserRoundCog },
  { label: 'Register Courses', href: '/student/registration', icon: BookOpen },
  { label: 'Download Transcript', href: '/student/transcripts', icon: FileText },
  { label: 'Pay Fees', href: '/student/finance', icon: Wallet },
  { label: 'Raise Ticket', href: '/student/helpdesk', icon: LifeBuoy },
  { label: 'View Timetable', href: '/student/timetable', icon: CalendarDays },
] as const;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

function classesNeededToReach75(currentPct: number, assumedHeld = 40): number {
  if (currentPct >= 75) return 0;
  const present = Math.round((currentPct / 100) * assumedHeld);
  const need = Math.ceil(4 * (0.75 * assumedHeld - present));
  return Math.max(0, need);
}

function relativeTime(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function to12h(hhmm: string) {
  const mins = timeStringToMinutes(hhmm);
  if (Number.isNaN(mins)) return hhmm;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function slotCountdownLabel(
  slot: ScheduleItem,
  nowMinutes: number,
): string | null {
  const start = timeStringToMinutes(slot.start);
  const end = timeStringToMinutes(slot.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (slot.status === 'ongoing') {
    return `Live · ends in ${formatCountdown(Math.max(0, end - nowMinutes))}`;
  }
  if (slot.status === 'upcoming') {
    return `Starts in ${formatCountdown(Math.max(0, start - nowMinutes))}`;
  }
  return null;
}

type AssignmentFilter = 'all' | 'today' | 'week' | 'later';

function assignmentUrgency(dueAt: string, now = new Date()): AssignmentFilter {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'later';
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  if (due < endOfToday) return 'today';
  if (due < endOfWeek) return 'week';
  return 'later';
}

function buildDemoSchedule(): ScheduleItem[] {
  const now = getIstMinutesNow();
  return DEMO_TODAY_SCHEDULE.map((row) => ({
    id: row.id,
    subject: row.subject,
    faculty: row.faculty,
    room: row.room,
    start: row.start,
    end: row.end,
    status: getTimetableSlotStatus(row.start, row.end, now),
  })).sort((a, b) => timeStringToMinutes(a.start) - timeStringToMinutes(b.start));
}

function buildDemoAssignments(): AssignmentItem[] {
  return DEMO_ASSIGNMENTS.map((a) => ({
    id: a.id,
    subject: a.subject,
    title: a.title,
    dueAt: a.dueAt,
    courseId: a.courseId,
    status: a.status,
  }));
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'default',
  progress,
  href,
  className,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'default' | 'gold' | 'success' | 'warning' | 'danger';
  progress?: number;
  href?: string;
  className?: string;
}) {
  const tones = {
    default: 'border-sgvu-navy/10 bg-white',
    gold: 'border-sgvu-gold/30 bg-gradient-to-br from-sgvu-gold/10 to-white',
    success: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-white',
    warning: 'border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white',
    danger: 'border-red-200/80 bg-gradient-to-br from-red-50/60 to-white',
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
          {label}
        </p>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sgvu-navy/5 text-sgvu-navy transition group-hover:bg-sgvu-gold/20">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 break-words text-xl font-black tracking-tight text-sgvu-navy sm:text-2xl xl:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{helper}</p>
      {typeof progress === 'number' ? (
        <Progress value={Math.min(100, Math.max(0, progress))} className="mt-3 h-1.5" />
      ) : (
        <div className="mt-3 h-1.5" />
      )}
      {href ? (
        <p className="mt-2 flex items-center gap-0.5 text-[11px] font-semibold text-sgvu-navy/70 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Open <ChevronRight className="h-3 w-3" />
        </p>
      ) : null}
    </>
  );
  const cardClass = cn(
    'group flex h-full min-w-0 flex-col rounded-2xl border p-4 shadow-sm transition duration-200',
    'hover:-translate-y-0.5 hover:border-sgvu-gold/50 hover:shadow-md',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/60 focus-visible:ring-offset-2',
    tones[tone],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cardClass} aria-label={`${label}: ${value}`}>
        {body}
      </Link>
    );
  }
  return <div className={cardClass}>{body}</div>;
}

function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex h-full flex-col rounded-2xl border border-sgvu-navy/10 bg-white shadow-sm transition duration-300 animate-in fade-in slide-in-from-bottom-2',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-sgvu-navy/8 px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sgvu-gold/20 text-sgvu-navy">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-sgvu-navy md:text-base">{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1 p-4 md:p-5">{children}</div>
    </section>
  );
}

export function StudentEnterpriseDashboard() {
  const router = useRouter();
  const { user, token } = useAuth();
  const api = useAuthedApi();
  const { notifications, refresh: refreshNotifications } = useNotificationHistory();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hub, setHub] = useState<PlacementHub | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [examDesk, setExamDesk] = useState<ExamDesk | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [libraryDueCount, setLibraryDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(() => getIstMinutesNow());
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    const tick = () => setNowMinutes(getIstMinutesNow());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSchedule((prev) =>
      prev.map((slot) => ({
        ...slot,
        status: getTimetableSlotStatus(slot.start, slot.end, nowMinutes),
      })),
    );
  }, [nowMinutes]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [metricsR, profileR, hubR, financeR, examR, todayR, assignR, libraryR] =
        await Promise.allSettled([
          api.get<Summary>('/api/academics/dashboard/metrics'),
          api.get<Profile>('/api/student/profile'),
          api.get<PlacementHub>('/api/placement/student/hub'),
          api.get<Ledger>('/api/student/finance'),
          api.get<ExamDesk>('/api/student/exam-desk'),
          api.get<Array<Record<string, unknown>>>('/api/academics/dashboard/timetable/today'),
          api.get<
            Array<{
              assignment: {
                assignment_id: string;
                title: string;
                due_date: string;
                course_id?: string;
              };
              status?: string;
              submission?: unknown;
            }>
          >('/api/academics/assignments/my'),
          api.get<{
            active_loans?: Array<{ status?: string; due_date?: string }>;
          }>('/api/student/library'),
        ]);
      if (cancelled) return;
      if (metricsR.status === 'fulfilled') setSummary(metricsR.value);
      if (profileR.status === 'fulfilled') setProfile(profileR.value);
      if (hubR.status === 'fulfilled') setHub(hubR.value);
      if (financeR.status === 'fulfilled') setLedger(financeR.value);
      if (examR.status === 'fulfilled') setExamDesk(examR.value);

      if (todayR.status === 'fulfilled' && Array.isArray(todayR.value) && todayR.value.length) {
        const now = getIstMinutesNow();
        const mapped: ScheduleItem[] = todayR.value.slice(0, 8).map((row, i) => {
          const start = String(row.start_time ?? row.start ?? '09:00').slice(0, 5);
          const end = String(row.end_time ?? row.end ?? '10:00').slice(0, 5);
          return {
            id: String(row.id ?? i),
            subject: String(row.subject ?? row.course_name ?? row.title ?? 'Class'),
            faculty: String(row.faculty_name ?? row.faculty ?? 'Faculty'),
            room: String(row.room ?? row.room_number ?? 'TBA'),
            start,
            end,
            status: getTimetableSlotStatus(start, end, now),
          };
        });
        setSchedule(mapped);
      } else if (isStudentDemoModeEnabled()) {
        setSchedule(buildDemoSchedule());
      } else {
        setSchedule([]);
      }

      if (assignR.status === 'fulfilled' && Array.isArray(assignR.value)) {
        const mapped: AssignmentItem[] = assignR.value
          .filter((row) => {
            const status = String(row.status ?? '').toUpperCase();
            return !['SUBMITTED', 'GRADED', 'CLOSED'].includes(status) && !row.submission;
          })
          .slice(0, 12)
          .map((row) => ({
            id: row.assignment.assignment_id,
            subject: 'Course work',
            title: row.assignment.title,
            dueAt: row.assignment.due_date,
            courseId: row.assignment.course_id,
            status: 'Pending' as const,
          }));
        setAssignments(
          mapped.length || !isStudentDemoModeEnabled() ? mapped : buildDemoAssignments(),
        );
      } else {
        setAssignments(isStudentDemoModeEnabled() ? buildDemoAssignments() : []);
      }

      if (libraryR.status === 'fulfilled') {
        const loans = libraryR.value.active_loans ?? [];
        const dueSoon = loans.filter((b) => {
          const status = String(b.status ?? '').toUpperCase();
          if (status === 'OVERDUE') return true;
          if (!b.due_date) return false;
          const due = new Date(b.due_date).getTime();
          return Number.isFinite(due) && due <= Date.now() + 7 * 24 * 60 * 60 * 1000;
        });
        setLibraryDueCount(dueSoon.length);
      } else {
        setLibraryDueCount(0);
      }

      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const alertItems = useMemo(
    () => notifications.map(toAppNotification).filter((n) => n.unread).slice(0, 3),
    [notifications],
  );

  const demoOn = isStudentDemoModeEnabled();
  const displayProfile = {
    name: profile?.name || user?.name || (demoOn ? DEMO_STUDENT.name : 'Student'),
    enrollment_no:
      profile?.enrollment_no || (demoOn ? DEMO_STUDENT.enrollment_no : '—'),
    program: profile?.program || (demoOn ? DEMO_STUDENT.program : ''),
    branch: profile?.branch || (demoOn ? DEMO_STUDENT.branch : ''),
    semester: profile?.semester || (demoOn ? DEMO_STUDENT.semester : undefined),
    session: profile?.session || (demoOn ? DEMO_STUDENT.session : null),
    profile_photo_url:
      profile?.profile_photo_url ?? (demoOn ? DEMO_STUDENT.profile_photo_url : null),
  };

  const cgpa = summary?.cgpa ?? (demoOn ? DEMO_DASHBOARD_METRICS.cgpa : 0);
  const creditsDone =
    summary?.credits_completed ?? (demoOn ? DEMO_DASHBOARD_METRICS.credits_completed : 0);
  const creditsReq =
    summary?.credits_required || (demoOn ? DEMO_DASHBOARD_METRICS.credits_required : 160);
  const creditPct = Math.round((creditsDone / Math.max(1, creditsReq)) * 100);
  const attendance =
    summary?.attendance_percent ?? (demoOn ? DEMO_DASHBOARD_METRICS.attendance_percent : 0);
  const needClasses = classesNeededToReach75(attendance);

  const pendingRows =
    ledger?.pending_demands ??
    ledger?.demands ??
    (ledger?.fee_structure ?? []).filter(
      (d) =>
        Number(d.payable_amount ?? d.amount ?? 0) > 0 &&
        !['PAID', 'WAIVED'].includes(String(d.status ?? '').toUpperCase()),
    );
  const pendingFeeFromLedger =
    ledger?.total_outstanding != null
      ? Number(ledger.total_outstanding)
      : pendingRows.reduce(
          (sum, d) => sum + Number(d.payable_amount ?? d.amount ?? 0),
          0,
        );
  const pendingFee =
    ledger != null
      ? pendingFeeFromLedger
      : demoOn
        ? DEMO_DASHBOARD_METRICS.fee_outstanding
        : 0;
  const feeClear =
    Boolean(ledger?.gates?.finance_clear) ||
    (!ledger?.gates?.admit_card_locked && pendingFee <= 0);
  const pendingAssignments = assignments.filter((a) => a.status !== 'Submitted').length;
  const upcomingExams = (examDesk?.upcoming_exams ?? []).slice(0, 4);
  const examCards =
    upcomingExams.length > 0
      ? upcomingExams
      : demoOn
        ? DEMO_EXAMS.slice(0, 4).map((ex) => ({
            subject: ex.subject,
            course_name: ex.subject,
            exam_date: ex.exam_date,
            date: ex.exam_date,
            start_time: ex.start_time,
            time: ex.start_time,
            hall: `${ex.hall} · Seat ${ex.seat}`,
            room: ex.hall,
          }))
        : [];

  const openDrives = hub?.open_drives?.length ?? (demoOn ? DEMO_PLACEMENTS.open_drives.length : 0);
  const applications =
    hub?.my_applications?.length ?? (demoOn ? DEMO_PLACEMENTS.applications : 0);
  const liveInterviews = (hub?.my_applications ?? []).filter((a) =>
    /interview/i.test(String(a.pipeline_stage ?? '')),
  ).length;
  const interviews = liveInterviews || (demoOn ? DEMO_PLACEMENTS.interviews : 0);
  const offers = hub?.placement_lock?.locked ? 1 : demoOn ? DEMO_PLACEMENTS.offers : 0;

  const sortedSchedule = useMemo(() => {
    const rank = { ongoing: 0, upcoming: 1, done: 2 } as const;
    return [...schedule].sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      return timeStringToMinutes(a.start) - timeStringToMinutes(b.start);
    });
  }, [schedule]);

  const scheduleHeadline = useMemo(() => {
    const live = sortedSchedule.find((s) => s.status === 'ongoing');
    if (live) {
      const label = slotCountdownLabel(live, nowMinutes);
      return label ? `${live.subject} · ${label}` : `${live.subject} · Live now`;
    }
    const next = sortedSchedule.find((s) => s.status === 'upcoming');
    if (next) {
      const label = slotCountdownLabel(next, nowMinutes);
      return label ? `Next: ${next.subject} · ${label}` : `Next: ${next.subject}`;
    }
    return 'No more classes today';
  }, [sortedSchedule, nowMinutes]);

  const filteredAssignments = useMemo(() => {
    const pending = assignments.filter((a) => a.status !== 'Submitted');
    if (assignmentFilter === 'all') return pending;
    return pending.filter((a) => assignmentUrgency(a.dueAt) === assignmentFilter);
  }, [assignments, assignmentFilter]);

  const openAlert = async (id: string, actionLink: string | null | undefined) => {
    if (!token) return;
    try {
      await handleNotificationAction(token, actionLink, router);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open notification');
      return;
    }
    if (!isDemoNotificationId(id)) {
      await notificationsApi.markRead(token, id).catch(() => undefined);
      await refreshNotifications();
    }
  };

  const markAllAlertsRead = async () => {
    if (!token || markingAllRead || alertItems.length === 0) return;
    setMarkingAllRead(true);
    try {
      const liveIds = alertItems.filter((a) => !isDemoNotificationId(a.id)).map((a) => a.id);
      if (liveIds.length > 0) {
        await notificationsApi.markAllRead(token);
      }
      await refreshNotifications();
      toast.success('All alerts marked as read');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark alerts as read');
    } finally {
      setMarkingAllRead(false);
    }
  };

  const displayName = displayProfile.name || user?.name || 'Student';
  const firstName = displayName.split(' ')[0] ?? 'Student';
  const enrollment = displayProfile.enrollment_no || '—';
  const program = displayProfile.program || displayProfile.branch || 'Program';
  const semester = displayProfile.semester ? `Semester ${displayProfile.semester}` : 'Current semester';

  return (
    <StudentPageShell width="full" className="animate-in fade-in duration-500">
      {/* Welcome banner */}
      <section className="overflow-hidden rounded-2xl border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 p-4 text-white shadow-lg shadow-sgvu-navy/10 sm:p-5 md:p-6 lg:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-sgvu-gold sm:text-sm">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                {greeting()} · {formatToday()}
              </span>
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Hi, {firstName}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                {program}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                {semester}
              </span>
              <span className="rounded-full bg-sgvu-gold/20 px-3 py-1 text-xs font-semibold text-sgvu-gold">
                ENR {enrollment}
              </span>
            </div>
          </div>
          <StudentAvatar
            photoUrl={displayProfile.profile_photo_url}
            name={displayName}
            alt={`${displayName} photo`}
            frameClassName="h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl"
            editable
            onPhotoUpdated={(url) =>
              setProfile((prev) => ({ ...(prev ?? {}), profile_photo_url: url }))
            }
          />
        </div>
      </section>

      <NoticeBoardWidget />

      {libraryDueCount > 0 ? (
        <Link
          href="/student/library"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 transition hover:border-amber-300 hover:bg-amber-100/80"
        >
          <span className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4" />
            Library: {libraryDueCount} book{libraryDueCount === 1 ? '' : 's'} due or overdue
          </span>
          <span className="text-xs font-semibold underline">View loans</span>
        </Link>
      ) : null}

      {/* KPI row — 1 / 2 / 3 / 6 across breakpoints */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {
            label: 'Overall CGPA',
            value: loading ? '—' : cgpa.toFixed(2),
            helper: 'Cumulative grade points',
            icon: GraduationCap,
            tone: 'gold' as const,
            progress: Math.min(100, (cgpa / 10) * 100),
            href: '/student/marks',
            delay: 'delay-0',
          },
          {
            label: 'Attendance',
            value: loading ? '—' : `${attendance}%`,
            helper: attendance >= 75 ? 'Above 75% minimum' : 'Below 75% minimum',
            icon: UserRoundCheck,
            tone: (attendance >= 75 ? 'success' : 'warning') as 'success' | 'warning',
            progress: attendance,
            href: '/student/attendance',
            delay: 'delay-75',
          },
          {
            label: 'Degree Progress',
            value: loading ? '—' : `${creditsDone}/${creditsReq}`,
            helper: `${creditPct}% credits completed`,
            icon: CreditCard,
            tone: 'default' as const,
            progress: creditPct,
            href: '/student/exit',
            delay: 'delay-100',
          },
          {
            label: 'Fee Status',
            value: feeClear ? 'Clear' : `₹${pendingFee.toLocaleString('en-IN')}`,
            helper: feeClear ? 'No pending demands' : 'Pending dues',
            icon: Wallet,
            tone: (feeClear ? 'success' : 'danger') as 'success' | 'danger',
            href: '/student/finance',
            delay: 'delay-150',
          },
          {
            label: 'Pending Assignments',
            value: String(pendingAssignments),
            helper: 'Due this week',
            icon: ClipboardList,
            tone: (pendingAssignments > 0 ? 'warning' : 'success') as 'warning' | 'success',
            href: '/student/courses',
            delay: 'delay-200',
          },
          {
            label: 'Upcoming Exams',
            value: String(examCards.length),
            helper: 'Scheduled assessments',
            icon: CalendarClock,
            tone: 'default' as const,
            href: '/student/exams',
            delay: 'delay-300',
          },
        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            helper={kpi.helper}
            icon={kpi.icon}
            tone={kpi.tone}
            progress={kpi.progress}
            href={kpi.href}
            className={cn('animate-in fade-in slide-in-from-bottom-2 fill-mode-both', kpi.delay)}
          />
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Alerts — 4 cols */}
        <div className="xl:col-span-4 animate-in fade-in slide-in-from-bottom-2 delay-100 fill-mode-both">
          <Panel
            title="Alerts"
            description="Latest unread updates"
            icon={Bell}
            action={
              <div className="flex items-center gap-2">
                {alertItems.length > 0 ? (
                  <button
                    type="button"
                    disabled={markingAllRead}
                    onClick={() => void markAllAlertsRead()}
                    className="text-xs font-semibold text-sgvu-navy/70 transition hover:text-sgvu-navy hover:underline disabled:opacity-50"
                  >
                    {markingAllRead ? 'Marking…' : 'Mark all read'}
                  </button>
                ) : null}
                <Link href="/notifications" className="text-xs font-semibold text-sgvu-navy hover:underline">
                  View all
                </Link>
              </div>
            }
          >
            {alertItems.length === 0 ? (
              <StudentEmptyState
                icon={CheckCircle2}
                title="All caught up"
                description="No unread alerts right now."
                className="py-8"
              />
            ) : (
              <div className="space-y-2.5">
                {alertItems.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => void openAlert(alert.id, alert.actionLink)}
                    className="flex w-full items-start gap-3 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3 text-left transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        alert.severity === 'critical' || alert.intent === 'action_required'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-sgvu-navy/10 text-sgvu-navy',
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-sgvu-navy">{alert.title}</p>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-sgvu-navy/15 text-[10px] uppercase"
                        >
                          {alert.intent === 'action_required' ? 'Action' : alert.severity}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {relativeTime(alert.createdAt)}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Attendance detail — 4 cols */}
        <div className="xl:col-span-4">
          <Panel title="Attendance" description="Current semester standing" icon={UserRoundCheck}>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Current %</p>
                  <p className="text-3xl font-black text-sgvu-navy">{attendance}%</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-muted-foreground">Minimum required</p>
                  <p className="text-lg font-bold text-sgvu-navy">75%</p>
                </div>
              </div>
              <Progress value={attendance} className="h-2.5" />
              <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">Classes needed to reach 75%</p>
                <p className="text-sm font-bold text-sgvu-navy">
                  {needClasses === 0
                    ? 'You are already above the minimum'
                    : `${needClasses} consecutive present class${needClasses === 1 ? '' : 'es'} (estimate)`}
                </p>
              </div>
              <Link
                href="/student/attendance"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sgvu-navy hover:underline"
              >
                Subject-wise breakdown
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>
        </div>

        {/* Degree progress — 4 cols */}
        <div className="xl:col-span-4">
          <Panel title="Degree Progress" description="Credits toward graduation" icon={GraduationCap}>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Credits completed</p>
                  <p className="text-3xl font-black text-sgvu-navy">
                    {creditsDone}
                    <span className="text-base font-semibold text-muted-foreground"> / {creditsReq}</span>
                  </p>
                </div>
                <p className="text-2xl font-black text-sgvu-gold">{creditPct}%</p>
              </div>
              <Progress value={creditPct} className="h-2.5" />
              <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">Expected graduation</p>
                <p className="text-sm font-bold text-sgvu-navy">
                  {displayProfile.session ? `Session ${displayProfile.session}` : 'Based on current credit pace'}
                </p>
              </div>
              <Link
                href="/student/exit"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sgvu-navy hover:underline"
              >
                Graduation & alumni
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>
        </div>

        {/* Today's schedule — 5 cols */}
        <div className="xl:col-span-5 animate-in fade-in slide-in-from-bottom-2 delay-150 fill-mode-both">
          <Panel
            title="Today's Schedule"
            description={scheduleHeadline}
            icon={CalendarDays}
            action={
              <Link href="/student/timetable" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Full timetable
              </Link>
            }
          >
            <div className="space-y-2">
              {sortedSchedule.length === 0 ? (
                <StudentEmptyState
                  icon={CalendarDays}
                  title="No classes today"
                  description="Your timetable is clear for today."
                  className="py-6"
                />
              ) : (
                sortedSchedule.slice(0, 4).map((slot) => {
                  const countdown = slotCountdownLabel(slot, nowMinutes);
                  return (
                    <Link
                      key={slot.id}
                      href="/student/timetable"
                      className={cn(
                        'block rounded-xl border px-3 py-2.5 transition',
                        'hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50',
                        slot.status === 'ongoing' && 'border-sgvu-gold/60 bg-sgvu-gold/15 shadow-sm shadow-sgvu-gold/10',
                        slot.status === 'upcoming' && 'border-sgvu-navy/10 bg-white hover:border-sgvu-gold/40',
                        slot.status === 'done' && 'border-border/60 bg-slate-50 opacity-70 hover:opacity-90',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-sgvu-navy">{slot.subject}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {slot.faculty} · <MapPin className="mr-0.5 inline h-3 w-3" />
                            {slot.room}
                          </p>
                          {countdown ? (
                            <p
                              className={cn(
                                'mt-1 text-[11px] font-semibold',
                                slot.status === 'ongoing' ? 'text-amber-800' : 'text-sgvu-navy/70',
                              )}
                            >
                              {countdown}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-bold text-sgvu-navy">
                            {to12h(slot.start)} – {to12h(slot.end)}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              'mt-1 text-[10px]',
                              slot.status === 'ongoing' &&
                                'animate-pulse border-sgvu-gold/50 bg-sgvu-gold/30 text-sgvu-navy',
                            )}
                          >
                            {slot.status === 'ongoing'
                              ? 'Live'
                              : slot.status === 'upcoming'
                                ? 'Up next'
                                : 'Done'}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Assignments — 4 cols */}
        <div className="xl:col-span-4 animate-in fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
          <Panel
            title="Pending Assignments"
            description="Filter by urgency"
            icon={ClipboardList}
            action={
              <Link href="/student/courses" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Courses
              </Link>
            }
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'today', label: 'Due today' },
                  { id: 'week', label: 'This week' },
                  { id: 'later', label: 'Later' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setAssignmentFilter(chip.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                    assignmentFilter === chip.id
                      ? 'border-sgvu-navy bg-sgvu-navy text-white'
                      : 'border-sgvu-navy/15 bg-white text-sgvu-navy hover:border-sgvu-gold/50 hover:bg-sgvu-gold/10',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {filteredAssignments.length === 0 ? (
                <StudentEmptyState
                  icon={ClipboardList}
                  title="Nothing in this filter"
                  description="Try another urgency chip or open Courses."
                  className="py-6"
                />
              ) : (
                filteredAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 px-3 py-2.5 transition hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sgvu-navy">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.subject} · Due{' '}
                        {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                          new Date(a.dueAt),
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 shrink-0 bg-sgvu-navy text-white transition active:scale-[0.98] hover:bg-[#123A6D]"
                      asChild
                    >
                      <Link href={`/student/courses/${a.courseId}`}>Submit</Link>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Exams — 3 cols */}
        <div className="xl:col-span-3 animate-in fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
          <Panel
            title="Upcoming Exams"
            description="Date · time · hall"
            icon={Ticket}
            action={
              <Link href="/student/exams" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Exam desk
              </Link>
            }
          >
            <div className="space-y-2">
              {examCards.length === 0 ? (
                <StudentEmptyState
                  icon={Ticket}
                  title="No upcoming exams"
                  description="Scheduled assessments will appear here."
                  className="py-6"
                />
              ) : (
                examCards.map((ex, i) => (
                  <Link
                    key={i}
                    href="/student/exams"
                    className="block rounded-xl border border-sgvu-navy/10 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50"
                  >
                    <p className="text-sm font-semibold text-sgvu-navy">
                      {ex.subject ?? ex.course_name ?? 'Exam'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ex.exam_date ?? ex.date ?? 'TBA'} · {ex.start_time ?? ex.time ?? '—'} ·{' '}
                      {ex.hall ?? ex.room ?? 'Hall TBA'}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Placement summary — 8 cols */}
        <div className="xl:col-span-8 animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-both">
          <Panel
            title="Placement Summary"
            description="Campus & department recruitment"
            icon={Briefcase}
            action={
              <Link href="/student/placements" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Placements hub
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'Eligible Companies', value: openDrives },
                { label: 'Applications', value: applications },
                { label: 'Interviews', value: interviews },
                { label: 'Offers', value: offers },
              ].map((stat) => (
                <Link
                  key={stat.label}
                  href="/student/placements"
                  className="rounded-xl border border-sgvu-navy/10 bg-slate-50 px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50"
                >
                  <p className="text-2xl font-black text-sgvu-navy">{stat.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                </Link>
              ))}
            </div>
            {openDrives === 0 && applications === 0 ? (
              <div className="mt-4">
                <StudentEmptyState
                  icon={Briefcase}
                  title="No active placement activity"
                  description="Eligible companies and applications will appear here when drives are announced."
                  className="py-6"
                />
              </div>
            ) : null}
          </Panel>
        </div>

        {/* Quick actions — 4 cols */}
        <div className="xl:col-span-4 animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-both">
          <Panel title="Quick Actions" description="Common student tasks" icon={Download}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                const className =
                  'group flex w-full items-center gap-3 rounded-xl border border-sgvu-navy/10 bg-white px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50';
                const content = (
                  <>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy transition group-hover:bg-sgvu-gold/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold text-sgvu-navy">{action.label}</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-sgvu-navy" />
                  </>
                );
                if ('action' in action && action.action === 'id-card') {
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => setIdCardOpen(true)}
                      className={className}
                    >
                      {content}
                    </button>
                  );
                }
                if (!('href' in action)) return null;
                return (
                  <Link key={action.label} href={action.href} className={className}>
                    {content}
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <StudentIdCardDialog open={idCardOpen} onOpenChange={setIdCardOpen} />
    </StudentPageShell>
  );
}
