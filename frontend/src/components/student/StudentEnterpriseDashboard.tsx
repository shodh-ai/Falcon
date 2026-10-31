'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Briefcase,
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
  Ticket,
  UserRoundCheck,
  UserRoundCog,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useModuleRuntime } from '@/context/ModuleRuntimeContext';
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
import { resolvePathModule } from '@/lib/launch-modules';
import type { BusinessModuleKey } from '@/lib/launch-modules';
import { withStudentReadTimeout } from '@/lib/student-read-request';
import {
  getCurrentAttendanceSemester,
  getSemesterAttendance,
  type StudentAttendanceData,
} from '@/lib/student-attendance';
import { getSemesterGpa } from '@/lib/student-semester-gpa';
import type { PlacementHub } from '@/lib/placement';
import type { ExamSchedule } from '@/lib/api/api.exams';
import {
  DEMO_DASHBOARD_METRICS,
  DEMO_PLACEMENTS,
  DEMO_STUDENT,
  isDemoNotificationId,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import {
  isStudentLibraryLaunched,
  isStudentLibraryLoanDue,
} from '@/lib/student-library-launch';
import {
  getIstMinutesNow,
  getTimetableSlotStatus,
  timeStringToMinutes,
} from '@/lib/timetable-ist';

type Summary = {
  cgpa: number | null;
  credits_completed: number;
  credits_required: number;
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

type SemesterCourses = {
  current_semester: number;
  enrollments: Array<{
    semester: number;
    status: string;
    course: { course_id: string; course_code: string; course_name: string; credits: number };
  }>;
};

type SemesterGrade = {
  semester_number: number;
  sgpa: number | string | null;
  credits_attempted?: number;
  courses?: Array<{
    credits: number | string;
    grade?: string | null;
    grade_points?: number | string | null;
    status: string;
  }>;
};

type MarksHistory = { semesters: SemesterGrade[] };

function semesterCourseRows(payload: SemesterCourses | null) {
  return (payload?.enrollments ?? []).filter((row) =>
    Number(row.semester) === Number(payload?.current_semester) &&
    ['ENROLLED', 'COMPLETED'].includes(row.status) && row.course?.course_id,
  );
}

type ScheduleItem = {
  id: string;
  subject: string;
  faculty: string;
  room: string;
  start: string;
  end: string;
  status: 'upcoming' | 'ongoing' | 'done';
  isExtraClass?: boolean;
  cancelled?: boolean;
};

type AssignmentItem = {
  id: string;
  subject: string;
  title: string;
  dueAt: string;
  courseId?: string;
  status: 'Pending' | 'Due soon' | 'Submitted' | 'Returned for revision';
  actionLabel: 'Submit' | 'Re-upload' | 'Review';
};

type DashboardDataKey = 'metrics' | 'gpa' | 'attendance' | 'courses' | 'profile' | 'placements' | 'finance' | 'exams' | 'timetable' | 'assignments';
const DASHBOARD_SOURCES: Record<DashboardDataKey, { label: string; module?: BusinessModuleKey }> = {
  metrics: { label: 'Academic summary', module: 'sis_academics' },
  gpa: { label: 'GPA', module: 'sis_academics' },
  attendance: { label: 'Attendance', module: 'sis_academics' },
  courses: { label: 'Semester courses', module: 'sis_academics' },
  profile: { label: 'Profile' },
  placements: { label: 'Placements', module: 'placements_alumni' },
  finance: { label: 'Fees', module: 'finance_procurement' },
  exams: { label: 'Exams', module: 'examinations_credentials' },
  timetable: { label: 'Timetable', module: 'sis_academics' },
  assignments: { label: 'Assignments', module: 'lms_learning' },
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
  if (slot.cancelled) return null;
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
  const { token } = useAuth();
  const { manifest, module: runtimeModule } = useModuleRuntime();
  const disabledModules = Object.values(DASHBOARD_SOURCES)
    .flatMap((source) => source.module && runtimeModule(source.module)?.available === false ? [source.module] : []);
  // A changed account or module policy must not display the previous snapshot.
  return <StudentDashboardWorkspace key={`${token}:${manifest?.revision ?? ''}:${disabledModules.join(',')}`} disabledModules={disabledModules} />;
}

function StudentDashboardWorkspace({ disabledModules }: { disabledModules: BusinessModuleKey[] }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const { module: runtimeModule } = useModuleRuntime();
  const api = useAuthedApi();
  const { notifications, refresh: refreshNotifications } = useNotificationHistory();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [marksHistory, setMarksHistory] = useState<MarksHistory | null>(null);
  const [attendanceData, setAttendanceData] = useState<StudentAttendanceData | null>(null);
  const [semesterCourses, setSemesterCourses] = useState<SemesterCourses | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hub, setHub] = useState<PlacementHub | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [examSchedules, setExamSchedules] = useState<ExamSchedule[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [libraryDueCount, setLibraryDueCount] = useState(0);
  const libraryLaunched =
    isStudentLibraryLaunched() &&
    runtimeModule('library')?.available === true;
  const [loading, setLoading] = useState(true);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(() => getIstMinutesNow());
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [failedSources, setFailedSources] = useState<DashboardDataKey[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sourceEnabled = (key: DashboardDataKey) => {
    const moduleKey = DASHBOARD_SOURCES[key].module;
    return !moduleKey || !disabledModules.includes(moduleKey);
  };
  const canOpen = (href: string) => {
    const moduleKey = resolvePathModule(href);
    return !moduleKey || runtimeModule(moduleKey)?.available !== false;
  };
  const dataMessage = (key: DashboardDataKey) => {
    if (!sourceEnabled(key)) return `${DASHBOARD_SOURCES[key].label} module is unavailable`;
    if (loading) return 'Loading…';
    if (failedSources.includes(key)) return `${DASHBOARD_SOURCES[key].label} could not be loaded`;
    return null;
  };
  const retryDashboard = () => {
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const academicMessage = (key: 'timetable' | 'assignments' | 'exams') =>
    !sourceEnabled(key) ? dataMessage(key) : dataMessage('courses') ?? dataMessage(key);
  const kpiMessage = (key: DashboardDataKey) => {
    if (key === 'gpa') {
      if (!sourceEnabled('gpa')) return 'GPA module is unavailable';
      if (loading) return 'Loading…';
      return gpaSemester == null || dataMessage('gpa') ? 'GPA unavailable' : null;
    }
    return key === 'assignments' ? academicMessage('assignments') : dataMessage(key);
  };

  useEffect(() => {
    const tick = () => setNowMinutes(getIstMinutesNow());
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const enabled = (key: DashboardDataKey) => {
        const moduleKey = DASHBOARD_SOURCES[key].module;
        return !moduleKey || !disabledModules.includes(moduleKey);
      };
      const request = <T,>(key: DashboardDataKey, path: string) =>
        enabled(key) ? withStudentReadTimeout(api.get<T>(path)) : Promise.resolve(null);
      const coursesRequest = request<SemesterCourses>('courses', '/api/academics/courses/my-enrollments')
        .then((payload) => {
          if (payload != null && (!Number.isSafeInteger(Number(payload.current_semester)) || Number(payload.current_semester) < 1 || !Array.isArray(payload.enrollments))) {
            throw new Error('Current semester courses are unavailable');
          }
          return payload;
        });
      const examsRequest = enabled('exams') ? coursesRequest.then((courses) => {
        if (!courses) throw new Error('Current semester is unavailable');
        return request<ExamSchedule[]>('exams', `/api/academics/exams/schedule?semester=${Number(courses.current_semester)}`);
      }) : Promise.resolve(null);
      const marksRequest = request<MarksHistory>('gpa', '/api/academics/marks/history')
        .then((payload) => {
          if (payload != null && !Array.isArray(payload.semesters)) {
            throw new Error('Semester grades are unavailable');
          }
          return payload;
        });
      const [metricsR, marksR, attendanceR, coursesR, profileR, hubR, financeR, examR, todayR, assignR] =
        await Promise.allSettled([
          request<Summary>('metrics', '/api/academics/dashboard/metrics'),
          marksRequest,
          request<StudentAttendanceData>('attendance', '/api/student/attendance'),
          coursesRequest,
          request<Profile>('profile', '/api/student/profile'),
          request<PlacementHub>('placements', '/api/placement/student/hub'),
          request<Ledger>('finance', '/api/student/finance'),
          examsRequest,
          request<Array<Record<string, unknown>>>('timetable', '/api/academics/dashboard/timetable/today'),
          request<
            Array<{
              assignment: {
                assignment_id: string;
                title: string;
                due_date: string;
                course_id?: string;
              };
              status?: string;
              submission?: { revision_due_at?: string | null } | null;
              can_resubmit?: boolean;
            }>
          >('assignments', '/api/academics/assignments/my'),
        ]);
      if (cancelled) return;
      const keys: DashboardDataKey[] = ['metrics', 'gpa', 'attendance', 'courses', 'profile', 'placements', 'finance', 'exams', 'timetable', 'assignments'];
      const results = [metricsR, marksR, attendanceR, coursesR, profileR, hubR, financeR, examR, todayR, assignR];
      setFailedSources(keys.filter((key, index) => {
        const result = results[index];
        return enabled(key) && (result.status === 'rejected' || result.value == null);
      }));
      setSummary(metricsR.status === 'fulfilled' ? metricsR.value : null);
      setMarksHistory(marksR.status === 'fulfilled' ? marksR.value : null);
      setAttendanceData(attendanceR.status === 'fulfilled' ? attendanceR.value : null);
      const courses = coursesR.status === 'fulfilled' ? coursesR.value : null;
      setSemesterCourses(courses);
      const activeCourses = new Map(semesterCourseRows(courses)
        .filter((row) => row.status === 'ENROLLED')
        .map((row) => [row.course.course_id, row.course]));
      setProfile(profileR.status === 'fulfilled' ? profileR.value : null);
      setHub(hubR.status === 'fulfilled' ? hubR.value : null);
      setLedger(financeR.status === 'fulfilled' ? financeR.value : null);
      setExamSchedules(examR.status === 'fulfilled' && Array.isArray(examR.value) ? examR.value : []);

      if (todayR.status === 'fulfilled' && Array.isArray(todayR.value) && todayR.value.length) {
        const now = getIstMinutesNow();
        const mapped: ScheduleItem[] = todayR.value.filter((row) => activeCourses.has(String(row.course_id))).slice(0, 8).map((row, i) => {
          const start = String(row.start_time ?? row.start ?? '').slice(0, 5);
          const end = String(row.end_time ?? row.end ?? '').slice(0, 5);
          return {
            id: String(row.timetable_id ?? row.id ?? i),
            subject: activeCourses.get(String(row.course_id))!.course_name,
            faculty: String(row.faculty_name ?? row.faculty ?? 'Faculty'),
            room: String(row.room ?? row.room_number ?? 'TBA'),
            start,
            end,
            status: getTimetableSlotStatus(start, end, now),
            isExtraClass: row.is_extra_class === true,
            cancelled: row.cancelled === true,
          };
        });
        setSchedule(mapped);
      } else {
        setSchedule([]);
      }

      if (assignR.status === 'fulfilled' && Array.isArray(assignR.value)) {
        const mapped: AssignmentItem[] = assignR.value
          .filter((row) => {
            if (!row.assignment.course_id || !activeCourses.has(row.assignment.course_id)) return false;
            const status = String(row.status ?? '').toUpperCase();
            if (status === 'RETURNED_FOR_REVISION') return true;
            return !['SUBMITTED', 'GRADED', 'CLOSED'].includes(status) && !row.submission;
          })
          .map((row) => ({
            id: row.assignment.assignment_id,
            subject: activeCourses.get(row.assignment.course_id!)!.course_name,
            title: row.assignment.title,
            dueAt: row.status === 'RETURNED_FOR_REVISION'
              ? row.submission?.revision_due_at ?? row.assignment.due_date
              : row.assignment.due_date,
            courseId: row.assignment.course_id,
            status: row.status === 'RETURNED_FOR_REVISION' ? 'Returned for revision' as const : 'Pending' as const,
            actionLabel: row.status === 'RETURNED_FOR_REVISION'
              ? row.can_resubmit === false ? 'Review' as const : 'Re-upload' as const
              : row.can_resubmit === false ? 'Review' as const : 'Submit' as const,
          }));
        setAssignments(mapped);
      } else {
        setAssignments([]);
      }

      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [api, disabledModules, loadAttempt]);

  useEffect(() => {
    let cancelled = false;

    if (!libraryLaunched) {
      return () => {
        cancelled = true;
      };
    }

    void api
      .get<{
        active_loans?: Array<{ status?: string; due_date?: string }>;
      }>('/api/student/library')
      .then((payload) => {
        if (cancelled) return;
        setLibraryDueCount(
          (payload.active_loans ?? []).filter((book) =>
            isStudentLibraryLoanDue(book),
          ).length,
        );
      })
      .catch(() => {
        if (!cancelled) setLibraryDueCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [api, libraryLaunched]);

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

  const creditsDone =
    summary?.credits_completed ?? (demoOn ? DEMO_DASHBOARD_METRICS.credits_completed : 0);
  const creditsReq =
    summary?.credits_required || (demoOn ? DEMO_DASHBOARD_METRICS.credits_required : 160);
  const creditPct = Math.round((creditsDone / Math.max(1, creditsReq)) * 100);
  const attendanceSemester = getCurrentAttendanceSemester(attendanceData);
  const attendanceTotals = getSemesterAttendance(attendanceData?.subject_wise ?? [], attendanceSemester);
  const attendance = attendanceTotals.percent;
  const attendanceValue = attendance == null ? 'Not recorded' : `${Number(attendance.toFixed(2))}%`;
  const attendanceContext = attendanceSemester == null ? 'Current semester' : `Semester ${attendanceSemester}`;
  const attendanceEmptyMessage = attendanceSemester == null
    ? 'No current semester attendance records are available yet.'
    : `No classes have been marked for Semester ${attendanceSemester} yet.`;
  const needClasses = attendanceTotals.classesNeeded;
  const currentCourses = semesterCourseRows(semesterCourses);
  const currentSemester = semesterCourses == null ? null : Number(semesterCourses.current_semester);
  const semesterContext = currentSemester == null ? 'Current semester' : `Semester ${currentSemester}`;
  const profileSemester = Number(profile?.semester);
  const gpaSemester = Number.isSafeInteger(profileSemester) && profileSemester > 0 ? profileSemester : currentSemester;
  const gpaContext = gpaSemester == null ? 'Current semester' : `Semester ${gpaSemester}`;
  const semesterGpa = getSemesterGpa(marksHistory?.semesters.find((row) => Number(row.semester_number) === gpaSemester));
  const currentCredits = currentCourses.reduce((sum, row) => sum + Number(row.course.credits), 0);

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
  const pendingAssignments = assignments.filter((a) => a.status !== 'Submitted');
  const pendingAssignmentCount = pendingAssignments.length;
  const dueTodayCount = pendingAssignments.filter((a) => {
    const due = new Date(a.dueAt);
    if (Number.isNaN(due.getTime())) return false;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return due >= start && due < end;
  }).length;
  const overdueCount = pendingAssignments.filter((a) => {
    const due = new Date(a.dueAt);
    if (Number.isNaN(due.getTime())) return false;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return due < start;
  }).length;
  const examCards = examSchedules.slice(0, 4);

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
    return schedule.map((slot) => ({
      ...slot, status: getTimetableSlotStatus(slot.start, slot.end, nowMinutes),
    })).sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      return timeStringToMinutes(a.start) - timeStringToMinutes(b.start);
    });
  }, [schedule, nowMinutes]);

  const scheduleHeadline = useMemo(() => {
    const live = sortedSchedule.find((s) => !s.cancelled && s.status === 'ongoing');
    if (live) {
      const label = slotCountdownLabel(live, nowMinutes);
      return label ? `${live.subject} · ${label}` : `${live.subject} · Live now`;
    }
    const next = sortedSchedule.find((s) => !s.cancelled && s.status === 'upcoming');
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
              <span className="min-w-0">
                {greeting()} · {formatToday()}
              </span>
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              Hi, {firstName}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {program}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {semester}
              </span>
              <span className="rounded-full bg-sgvu-gold/20 px-3 py-1 text-xs font-semibold text-white">
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

      {failedSources.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>Some dashboard data is unavailable: {failedSources.map((key) => DASHBOARD_SOURCES[key].label).join(', ')}.</p>
          <Button variant="outline" size="sm" disabled={loading} onClick={retryDashboard}>Retry dashboard</Button>
        </div>
      ) : null}

      {libraryLaunched && libraryDueCount > 0 ? (
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

      {/* KPI row — 1 / 2 / 3 / 5 across breakpoints */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: 'Current semester GPA',
            value: loading || semesterGpa == null ? '—' : semesterGpa.toFixed(2),
            helper: `${gpaContext} · ${semesterGpa == null ? 'Awaiting grades' : 'Credit-weighted semester GPA'}`,
            icon: GraduationCap,
            tone: 'gold' as const,
            progress: semesterGpa == null ? undefined : Math.min(100, (semesterGpa / 10) * 100),
            href: '/student/marks',
            delay: 'delay-0',
            source: 'gpa' as const,
          },
          {
            label: 'Attendance',
            value: loading ? '—' : attendanceValue,
            helper: attendance == null ? attendanceEmptyMessage : `${attendanceContext} · ${attendance >= 75 ? 'Meeting 75% minimum' : 'Below 75% minimum'}`,
            icon: UserRoundCheck,
            tone: (attendance == null ? 'default' : attendance >= 75 ? 'success' : 'warning') as 'default' | 'success' | 'warning',
            progress: attendance ?? undefined,
            href: '/student/attendance',
            delay: 'delay-75',
            source: 'attendance' as const,
          },
          {
            label: 'Degree Progress',
            value: loading ? '—' : `${creditsDone}/${creditsReq}`,
            helper: `Overall degree · ${creditPct}% credits completed`,
            icon: CreditCard,
            tone: 'default' as const,
            progress: creditPct,
            href: '/student/exit',
            delay: 'delay-100',
            source: 'metrics' as const,
          },
          {
            label: 'Fee Status',
            value: feeClear ? 'Clear' : `₹${pendingFee.toLocaleString('en-IN')}`,
            helper: feeClear ? 'All semesters · No pending demands' : 'All semesters · Outstanding dues',
            icon: Wallet,
            tone: (feeClear ? 'success' : 'danger') as 'success' | 'danger',
            href: '/student/finance',
            delay: 'delay-150',
            source: 'finance' as const,
          },
          {
            label: 'Pending Assignments',
            value: String(pendingAssignmentCount),
            helper:
              overdueCount > 0
                ? `${semesterContext} · ${dueTodayCount} due today · ${overdueCount} overdue`
                : dueTodayCount > 0
                  ? `${semesterContext} · ${dueTodayCount} due today`
                  : `${semesterContext} · No overdue work`,
            icon: ClipboardList,
            tone: (overdueCount > 0
              ? 'danger'
              : pendingAssignmentCount > 0
                ? 'warning'
                : 'success') as 'danger' | 'warning' | 'success',
            href: '/student/courses',
            delay: 'delay-200',
            source: 'assignments' as const,
          },
        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpiMessage(kpi.source) ? '—' : kpi.value}
            helper={kpiMessage(kpi.source) ?? kpi.helper}
            icon={kpi.icon}
            tone={kpiMessage(kpi.source) ? 'default' : kpi.tone}
            progress={kpiMessage(kpi.source) ? undefined : kpi.progress}
            href={canOpen(kpi.href) ? kpi.href : undefined}
            className={cn('animate-in fade-in slide-in-from-bottom-2 fill-mode-both', kpi.delay)}
          />
        ))}
      </div>

      {/* Main grid */}
      <Panel
        title="Current Semester Courses"
        description={`${semesterContext} · Current academic activity below uses these subjects only`}
        icon={BookOpen}
        action={canOpen('/student/courses') ? <Link href="/student/courses" className="text-xs font-semibold text-sgvu-navy hover:underline">Open course workspaces</Link> : undefined}
      >
        {dataMessage('courses') ? <StudentEmptyState title={dataMessage('courses')!} className="py-6" /> : currentCourses.length === 0 ? (
          <StudentEmptyState title="No current-semester courses" description="Your subjects will appear once you are registered for this semester." className="py-6" />
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{currentCourses.length} subjects · {currentCredits} registered credits this semester</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {currentCourses.map((row) => (
                <Link key={row.course.course_id} href={`/student/courses/${row.course.course_id}`} className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 p-3 transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50">
                  <p className="text-xs font-bold text-sgvu-navy">{row.course.course_code}</p>
                  <p className="mt-1 text-sm font-semibold text-sgvu-navy">{row.course.course_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.course.credits} credits · Open workspace</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Six overview cards share the same desktop width and minimum height. */}
        <div className="xl:col-span-4 xl:min-h-[17rem] animate-in fade-in slide-in-from-bottom-2 delay-100 fill-mode-both">
          <Panel
            title="Alerts"
            description="Account & campus updates"
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

        {/* Attendance detail */}
        <div className="xl:col-span-4 xl:min-h-[17rem]">
          <Panel title="Attendance" description={`${attendanceContext} · Current semester standing`} icon={UserRoundCheck}>
            {dataMessage('attendance') ? <StudentEmptyState title={dataMessage('attendance')!} className="py-6" /> : attendance == null ? <StudentEmptyState title="No classes marked yet" description={attendanceEmptyMessage} className="py-6" /> : <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Current %</p>
                  <p className="text-3xl font-black text-sgvu-navy">{attendanceValue}</p>
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
                    ? 'You meet the minimum requirement'
                    : `${needClasses} consecutive present class${needClasses === 1 ? '' : 'es'}`}
                </p>
              </div>
              <Link
                href="/student/attendance"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sgvu-navy hover:underline"
              >
                Subject-wise breakdown
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>}
          </Panel>
        </div>

        {/* Degree progress */}
        <div className="xl:col-span-4 xl:min-h-[17rem]">
          <Panel title="Degree Progress" description="Overall credits toward graduation" icon={GraduationCap}>
            {dataMessage('metrics') ? <StudentEmptyState title={dataMessage('metrics')!} className="py-6" /> : <div className="space-y-4">
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
            </div>}
          </Panel>
        </div>

        {/* Today's schedule */}
        <div className="xl:col-span-4 xl:min-h-[17rem] animate-in fade-in slide-in-from-bottom-2 delay-150 fill-mode-both">
          <Panel
            title="Today's Schedule"
            description={academicMessage('timetable') ?? `${semesterContext} · ${scheduleHeadline}`}
            icon={CalendarDays}
            action={
              canOpen('/student/timetable') && <Link href="/student/timetable" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Full timetable
              </Link>
            }
          >
            <div className="space-y-2">
              {academicMessage('timetable') ? <StudentEmptyState title={academicMessage('timetable')!} className="py-6" /> : sortedSchedule.length === 0 ? (
                <StudentEmptyState
                  icon={CalendarDays}
                  title="No classes today"
                  description={`No classes are scheduled for ${semesterContext} today.`}
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
                        slot.cancelled && 'border-red-200 bg-red-50 opacity-80',
                        !slot.cancelled && slot.status === 'ongoing' && 'border-sgvu-gold/60 bg-sgvu-gold/15 shadow-sm shadow-sgvu-gold/10',
                        !slot.cancelled && slot.status === 'upcoming' && 'border-sgvu-navy/10 bg-white hover:border-sgvu-gold/40',
                        !slot.cancelled && slot.status === 'done' && 'border-border/60 bg-slate-50 opacity-70 hover:opacity-90',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-sgvu-navy">{slot.subject}</p>
                          {slot.isExtraClass && <Badge variant="outline">Approved extra class</Badge>}
                          {slot.cancelled && <Badge variant="destructive">Cancelled · no attendance</Badge>}
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
                              !slot.cancelled && slot.status === 'ongoing' &&
                                'animate-pulse border-sgvu-gold/50 bg-sgvu-gold/30 text-sgvu-navy',
                            )}
                          >
                            {slot.cancelled ? 'Cancelled' : slot.status === 'ongoing'
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

        {/* Assignments */}
        <div className="xl:col-span-4 xl:min-h-[17rem] animate-in fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
          <Panel
            title="Pending Assignments"
            description={`${semesterContext} · Filter by urgency`}
            icon={ClipboardList}
            action={
              canOpen('/student/courses') && <Link href="/student/courses" className="text-xs font-semibold text-sgvu-navy hover:underline">
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
              {academicMessage('assignments') ? <StudentEmptyState title={academicMessage('assignments')!} className="py-6" /> : filteredAssignments.length === 0 ? (
                <StudentEmptyState
                  icon={ClipboardList}
                  title="Nothing in this filter"
                  description="Try another urgency chip or open Courses."
                  className="py-6"
                />
              ) : (
                filteredAssignments.slice(0, 12).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 px-3 py-2.5 transition hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sgvu-navy">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.status === 'Returned for revision' ? 'Returned for revision · ' : ''}{a.subject} · Due{' '}
                        {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(
                          new Date(a.dueAt),
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 shrink-0 bg-sgvu-navy text-white transition active:scale-[0.98] hover:bg-[#123A6D]"
                      asChild
                    >
                      <Link href={a.courseId ? `/student/courses/${a.courseId}` : '/student/courses'}>{a.actionLabel}</Link>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Exams */}
        <div className="xl:col-span-4 xl:min-h-[17rem] animate-in fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
          <Panel
            title="Upcoming Exams"
            description={`${semesterContext} · Upcoming assessments`}
            icon={Ticket}
            action={
              canOpen('/student/exams') && <Link href="/student/exams" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Exam desk
              </Link>
            }
          >
            <div className="space-y-2">
              {academicMessage('exams') ? <StudentEmptyState title={academicMessage('exams')!} className="py-6" /> : examCards.length === 0 ? (
                <StudentEmptyState
                  icon={Ticket}
                  title="No upcoming exams"
                  description={`No upcoming assessments are scheduled for ${semesterContext}.`}
                  className="py-6"
                />
              ) : (
                examCards.map((ex) => (
                  <Link
                    key={ex.exam_schedule_id}
                    href="/student/exams"
                    className="block rounded-xl border border-sgvu-navy/10 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold/50"
                  >
                    <p className="text-sm font-semibold text-sgvu-navy">
                      {ex.exam_type.replaceAll('_', ' ')} examination
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ex.exam_date} · {to12h(ex.start_time)} · View details in Exam desk
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
              canOpen('/student/placements') && <Link href="/student/placements" className="text-xs font-semibold text-sgvu-navy hover:underline">
                Placements hub
              </Link>
            }
          >
            {dataMessage('placements') ? <StudentEmptyState title={dataMessage('placements')!} className="py-6" /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
            </div>}
            {!dataMessage('placements') && openDrives === 0 && applications === 0 ? (
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
                if ('href' in action && !canOpen(action.href)) return null;
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
