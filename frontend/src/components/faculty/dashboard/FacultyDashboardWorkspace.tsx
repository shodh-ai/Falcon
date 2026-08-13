'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Mail,
  Sparkles,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';
import {
  FacultyPageShell,
  FacultyEmptyState,
  FacultyInlineLoading,
  FacultyErrorBanner,
} from '@/components/faculty';
import { MultiDepartmentTeachingSummary } from '@/components/faculty/MultiDepartmentTeachingSummary';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import { createMeetingsApi, type PortalMeetingRecord } from '@/lib/api/api.meetings';
import { notificationsApi, type FalconNotification } from '@/lib/api/notifications';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import {
  facultyDemoAtRisk,
  facultyDemoCourses,
  facultyDemoDuties,
  facultyDemoLeaveBalances,
  facultyDemoMeetings,
  facultyDemoMentees,
  facultyDemoMissingAttendance,
  facultyDemoNotifications,
  facultyDemoPendingApprovals,
  facultyDemoResearch,
  facultyDemoTodayClasses,
  facultyDemoWeeklyTests,
  FACULTY_DEMO_PROFILE,
} from '@/lib/mock/faculty-portal-demo';
import { cn } from '@/lib/utils';

type FacultyClass = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  start_time: string;
  end_time: string;
  student_count: number;
  section?: string | null;
};

type MissingAttendanceAlert = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  start_time: string;
  end_time: string;
  student_count: number;
};

type HrSummary = {
  today: { check_in_at: string | null; check_out_at: string | null } | null;
  week_hours: number;
  display?: { in_time: string; out_time: string };
};

type PendingApprovals = {
  certificates: unknown[];
  meetings?: unknown[];
  leave_requests?: unknown[];
};

type LeaveBalance = { leave_type: string; entitled: string | number; used: string | number };

type GatePassApproval = {
  pass_id: string;
  out_time: string;
  expected_in_time: string;
  reason: string;
  staff?: { name?: string; email?: string };
};

type FacultyProfile = {
  name?: string;
  display_name?: string;
  department?: string | null;
  employee_id?: string | null;
  designation?: string;
  active_mentees?: number;
};

type AtRiskStudent = {
  user_id: string;
  name: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  metrics: { attendance_percent: number | null; grades_percent: number | null };
};

type ResearchLog = {
  research_id?: string;
  log_id?: string;
  publication_title?: string;
  title?: string;
  publication_type?: string;
  status?: string;
};
type Duty = { assignment_id: string; exam_name?: string; exam_date?: string; room?: string; status?: string };
type WeeklyTest = { test_id?: string; is_active?: boolean; course_code?: string; test_type?: string };
type CourseRow = { course_id: string; course_code: string; course_name: string; semester?: string | null; academic_year?: string | null };
type Mentee = { user_id: string; name?: string; full_name?: string };

const PROFILE_COMPLIANCE_KEY = 'faculty-profile-compliance-dismissed';

function greetingForNow(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatTime(t?: string | null) {
  if (!t) return '—';
  return String(t).slice(0, 5);
}

function formatLongDate(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isSameDay(iso: string, day = new Date()) {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

const dashActionClass =
  'border-0 bg-sgvu-navy text-white shadow-sm hover:bg-[#123A6D] hover:text-white active:bg-sgvu-gold active:text-sgvu-navy focus-visible:ring-2 focus-visible:ring-sgvu-gold/50';

function CardShell({
  children,
  className,
  title,
  description,
  action,
  count,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  count?: number;
  tone?: 'default' | 'alert' | 'success';
}) {
  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md',
        tone === 'alert' && 'border-red-200/80 ring-1 ring-red-100',
        tone === 'success' && 'border-emerald-200/80',
        tone === 'default' && 'border-border/70',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-5 w-1 shrink-0 rounded-full',
                    tone === 'alert' ? 'bg-red-500' : tone === 'success' ? 'bg-emerald-500' : 'bg-sgvu-gold',
                  )}
                />
                <h2 className="text-sm font-bold text-sgvu-navy">{title}</h2>
                {count !== undefined ? (
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums',
                      tone === 'alert'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-sgvu-navy/10 text-sgvu-navy',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </div>
            ) : null}
            {description ? <p className="mt-1 pl-3 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function KpiLink({
  href,
  label,
  value,
  sub,
  icon: Icon,
  tone = 'navy',
}: {
  href: string;
  label: string;
  value: string | number;
  sub: string;
  icon: LucideIcon;
  tone?: 'navy' | 'gold' | 'alert' | 'emerald' | 'violet';
}) {
  const toneMap = {
    navy: 'border-l-sgvu-navy bg-white',
    gold: 'border-l-sgvu-gold bg-white',
    alert: 'border-l-red-500 bg-red-50/40',
    emerald: 'border-l-emerald-500 bg-white',
    violet: 'border-l-violet-500 bg-white',
  };
  const iconTone = {
    navy: 'bg-sgvu-navy/5 text-sgvu-navy',
    gold: 'bg-sgvu-gold/15 text-sgvu-navy',
    alert: 'bg-red-100 text-red-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  };

  return (
    <Link
      href={href}
      className={cn(
        'group rounded-xl border border-border/70 border-l-4 p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-sgvu-gold/50 hover:shadow-md active:scale-[0.98] sm:p-4',
        toneMap[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition group-hover:scale-105', iconTone[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-sgvu-navy">{value}</p>
      <p className="mt-1 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
        <span className="group-hover:text-sgvu-navy/80">{sub}</span>
        <span className="font-semibold text-sgvu-navy opacity-0 transition group-hover:opacity-100">Open →</span>
      </p>
    </Link>
  );
}

type PendingTaskPriority = 'High' | 'Medium' | 'Low';
type PendingTaskKind = 'open' | 'recommended' | 'cleared';

type PendingTask = {
  id: string;
  label: string;
  context: string;
  due: string;
  priority: PendingTaskPriority;
  kind: PendingTaskKind;
  href: string;
  cta: string;
};

function buildPendingTasks(input: {
  missingAttendanceCount: number;
  pendingCerts: number;
  pendingMeetings: number;
  pendingLeaves: number;
  activeTests: number;
  dutiesCount: number;
  nextDutyDate: string | null;
  gatePassCount: number;
  canManageTeam: boolean;
  coursesCount: number;
}): PendingTask[] {
  const tasks: PendingTask[] = [];

  const attendanceOpen = input.missingAttendanceCount > 0;
  tasks.push({
    id: 'attendance',
    label: 'Mark Attendance',
    context: attendanceOpen
      ? `${input.missingAttendanceCount} class${input.missingAttendanceCount === 1 ? '' : 'es'} need marking`
      : 'All of today’s sessions are marked',
    due: 'Today',
    priority: 'High',
    kind: attendanceOpen ? 'open' : 'cleared',
    href: '/faculty/attendance',
    cta: attendanceOpen ? 'Mark now' : 'View',
  });

  const approvalTotal = input.pendingCerts + input.pendingMeetings + input.pendingLeaves;
  const approvalsOpen = approvalTotal > 0;
  tasks.push({
    id: 'approvals',
    label: 'Mentorship & Approvals',
    context: approvalsOpen
      ? `${input.pendingCerts} cert · ${input.pendingMeetings} meeting · ${input.pendingLeaves} leave`
      : 'No mentorship or leave items waiting',
    due: 'This week',
    priority: approvalsOpen ? 'High' : 'Medium',
    kind: approvalsOpen ? 'open' : 'cleared',
    href: '/faculty/mentorship',
    cta: approvalsOpen ? 'Review' : 'Open',
  });

  const testsOpen = input.activeTests > 0;
  tasks.push({
    id: 'tests',
    label: 'Review Assignments / Tests',
    context: testsOpen
      ? `${input.activeTests} active weekly test${input.activeTests === 1 ? '' : 's'}`
      : 'No active weekly tests in your queue',
    due: 'Ongoing',
    priority: 'Medium',
    kind: testsOpen ? 'open' : 'cleared',
    href: '/faculty/weekly-tests',
    cta: testsOpen ? 'Review' : 'Open',
  });

  const dutiesOpen = input.dutiesCount > 0;
  tasks.push({
    id: 'exam-duty',
    label: 'Exam Paper / Duty Prep',
    context: dutiesOpen
      ? `${input.dutiesCount} exam dut${input.dutiesCount === 1 ? 'y' : 'ies'} on your roster`
      : 'No upcoming invigilation duties',
    due: input.nextDutyDate ?? 'Upcoming',
    priority: dutiesOpen ? 'High' : 'Low',
    kind: dutiesOpen ? 'open' : 'cleared',
    href: '/faculty/invigilation',
    cta: dutiesOpen ? 'Prepare' : 'Open',
  });

  if (input.canManageTeam) {
    const gateOpen = input.gatePassCount > 0;
    tasks.push({
      id: 'gate-pass',
      label: 'Gate Pass Approvals',
      context: gateOpen
        ? `${input.gatePassCount} staff request${input.gatePassCount === 1 ? '' : 's'} awaiting you`
        : 'No gate passes awaiting action',
      due: 'Today',
      priority: 'High',
      kind: gateOpen ? 'open' : 'cleared',
      href: '/faculty/inbox',
      cta: gateOpen ? 'Approve' : 'Open',
    });
  }

  if (input.coursesCount > 0) {
    tasks.push({
      id: 'materials',
      label: 'Upload Notes / Materials',
      context: `${input.coursesCount} course workspace${input.coursesCount === 1 ? '' : 's'} available`,
      due: 'This week',
      priority: 'Low',
      kind: 'recommended',
      href: '/faculty/courses',
      cta: 'Upload',
    });
    tasks.push({
      id: 'grades',
      label: 'Publish Grades',
      context: 'Open Exams & Grades when an assessment window is ready',
      due: 'Exam cycle',
      priority: 'Low',
      kind: 'recommended',
      href: '/faculty/grading',
      cta: 'Open grades',
    });
  }

  const rank = (t: PendingTask) => {
    if (t.kind === 'open') {
      if (t.priority === 'High') return 0;
      if (t.priority === 'Medium') return 1;
      return 2;
    }
    if (t.kind === 'recommended') return 3;
    return 4;
  };

  return tasks.sort((a, b) => rank(a) - rank(b));
}

function PendingTaskRow({ task }: { task: PendingTask }) {
  const pri =
    task.priority === 'High'
      ? 'bg-red-100 text-red-700'
      : task.priority === 'Medium'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-600';

  const isCleared = task.kind === 'cleared';
  const isRecommended = task.kind === 'recommended';
  const isHighOpen = !isCleared && !isRecommended && task.priority === 'High';

  return (
    <Link
      href={task.href}
      className={cn(
        'group flex flex-col gap-2 rounded-xl border px-3 py-3 transition sm:flex-row sm:items-center sm:justify-between',
        isCleared
          ? 'border-border/40 bg-slate-50/60 opacity-80 hover:opacity-100'
          : isRecommended
            ? 'border-dashed border-sgvu-navy/15 bg-white hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5'
            : isHighOpen
              ? 'border-red-200 bg-red-50/40 hover:border-red-300 hover:bg-red-50 hover:shadow-sm'
              : 'border-border/70 bg-white hover:border-sgvu-gold/45 hover:bg-sgvu-gold/5 hover:shadow-sm',
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
            isCleared
              ? 'bg-emerald-100 text-emerald-700'
              : isHighOpen
                ? 'bg-red-100 text-red-600'
                : 'border border-slate-200 bg-white text-slate-300',
          )}
        >
          {isHighOpen ? (
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
          ) : (
            <CheckCircle2 className={cn('h-3.5 w-3.5', isCleared ? 'text-emerald-600' : 'text-slate-300')} />
          )}
        </span>
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold text-sgvu-navy', isCleared && 'text-muted-foreground')}>
            {task.label}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{task.context}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
        {isRecommended ? (
          <span className="rounded-md bg-sgvu-navy/5 px-2 py-0.5 text-[10px] font-bold text-sgvu-navy">
            Recommended
          </span>
        ) : isCleared ? (
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            Done
          </span>
        ) : (
          <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', pri)}>{task.priority}</span>
        )}
        <span className="text-[11px] text-muted-foreground">{task.due}</span>
        {isCleared ? (
          <span className="text-[11px] font-semibold text-emerald-700">Cleared</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold text-white transition',
              'bg-sgvu-navy group-hover:bg-[#123A6D] group-active:bg-sgvu-gold group-active:text-sgvu-navy',
            )}
          >
            {task.cta} →
          </span>
        )}
      </div>
    </Link>
  );
}

export function FacultyDashboardWorkspace() {
  const api = useAuthedApi();
  const { user, token } = useAuth();
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const canManageTeam = canSeeFacultyTeamApprovals(user);

  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [missingAttendance, setMissingAttendance] = useState<MissingAttendanceAlert[]>([]);
  const [hrSummary, setHrSummary] = useState<HrSummary | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovals>({ certificates: [] });
  const [gatePassApprovals, setGatePassApprovals] = useState<GatePassApproval[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [profile, setProfile] = useState<FacultyProfile | null>(null);
  const [profileCompliance, setProfileCompliance] = useState<{
    needs_academic_profile: boolean;
    message: string | null;
  } | null>(null);
  const [complianceDismissed, setComplianceDismissed] = useState(false);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [research, setResearch] = useState<ResearchLog[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [weeklyTests, setWeeklyTests] = useState<WeeklyTest[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [meetings, setMeetings] = useState<PortalMeetingRecord[]>([]);
  const [notifications, setNotifications] = useState<FalconNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setComplianceDismissed(localStorage.getItem(PROFILE_COMPLIANCE_KEY) === '1');
    }
  }, []);

  useEffect(() => {
    if (deptLoading) return;
    let cancelled = false;
    const meetingsApi = createMeetingsApi(api);

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [
          classData,
          missingAttendanceData,
          hrData,
          approvalData,
          gatePassData,
          balanceData,
          complianceData,
          profileData,
          atRiskData,
          researchData,
          dutyData,
          weeklyData,
          courseData,
          menteeData,
          meetingData,
        ] = await Promise.all([
          api.get<FacultyClass[]>(withTeachingDeptId('/api/academics/faculty/timetable/today', activeDeptId)).catch(() => []),
          api.get<MissingAttendanceAlert[]>(withTeachingDeptId('/api/academics/faculty/attendance/missing', activeDeptId)).catch(() => []),
          api.get<HrSummary>('/api/hr/workforce/today').catch(() =>
            api.get<HrSummary>('/api/hr/attendance/my-summary').catch(() => null),
          ),
          api.get<PendingApprovals>('/api/academics/proctor/pending-approvals').catch(() => ({ certificates: [] })),
          canManageTeam
            ? api.get<GatePassApproval[]>('/api/hr/gate-passes/pending-approvals').catch(() => [])
            : Promise.resolve([] as GatePassApproval[]),
          api.get<LeaveBalance[]>('/api/hr/leaves/my-balances').catch(() => []),
          api.get<{ needs_academic_profile: boolean; message: string | null }>(
            '/api/academics/faculty/profile/compliance',
          ).catch(() => null),
          api.get<FacultyProfile>('/api/academics/faculty/profile').catch(() => null),
          api.get<AtRiskStudent[]>('/api/academics/early-warning/dashboard').catch(() => []),
          api.get<ResearchLog[]>('/api/academics/faculty/workspaces/research').catch(() => []),
          api.get<Duty[]>('/api/academics/faculty/workspaces/invigilation').catch(() => []),
          api.get<WeeklyTest[]>('/api/weekly-tests/faculty').catch(() => []),
          api.get<CourseRow[]>(withTeachingDeptId('/api/academics/faculty/workspaces/courses', activeDeptId)).catch(() => []),
          api.get<Mentee[]>('/api/academics/proctor/my-students').catch(() => []),
          meetingsApi.list().catch(() => [] as PortalMeetingRecord[]),
        ]);

        let notifData: FalconNotification[] = [];
        if (token) {
          notifData = await notificationsApi.recent(token).catch(() => []);
        }

        if (cancelled) return;

        const demoClasses = facultyDemoTodayClasses();
        const classesResolved = withFacultyDemoFallback(classData, demoClasses, isEmptyArray);
        setClasses(classesResolved);
        const assignedCourseIds = new Set(classesResolved.map((c) => c.course_id));
        const missingLive = missingAttendanceData.filter((a) => assignedCourseIds.has(a.course_id));
        setMissingAttendance(
          withFacultyDemoFallback(missingLive, facultyDemoMissingAttendance(), isEmptyArray),
        );
        setHrSummary(
          withFacultyDemoFallback(hrData, {
            today: {
              check_in_at: new Date().toISOString(),
              check_out_at: null,
            },
            week_hours: 34.5,
            display: { in_time: '09:08', out_time: '—' },
          }),
        );
        const approvalsResolved = withFacultyDemoFallback(
          approvalData,
          facultyDemoPendingApprovals() as PendingApprovals,
          (v) => {
            const row = v as PendingApprovals;
            return (
              (row.certificates?.length ?? 0) === 0 &&
              (row.meetings?.length ?? 0) === 0 &&
              (row.leave_requests?.length ?? 0) === 0
            );
          },
        );
        setPendingApprovals(approvalsResolved);
        setGatePassApprovals(gatePassData);
        setLeaveBalances(
          withFacultyDemoFallback(balanceData, facultyDemoLeaveBalances(), isEmptyArray),
        );
        if (complianceData) setProfileCompliance(complianceData);
        setProfile(withFacultyDemoFallback(profileData, FACULTY_DEMO_PROFILE()));
        setAtRisk(
          withFacultyDemoFallback(
            Array.isArray(atRiskData) ? atRiskData : [],
            facultyDemoAtRisk(),
            isEmptyArray,
          ),
        );
        setResearch(
          withFacultyDemoFallback(
            Array.isArray(researchData) ? researchData : [],
            facultyDemoResearch(),
            isEmptyArray,
          ),
        );
        setDuties(
          withFacultyDemoFallback(
            Array.isArray(dutyData) ? dutyData : [],
            facultyDemoDuties(),
            isEmptyArray,
          ),
        );
        setWeeklyTests(
          withFacultyDemoFallback(
            Array.isArray(weeklyData) ? weeklyData : [],
            facultyDemoWeeklyTests(),
            isEmptyArray,
          ),
        );
        setCourses(
          withFacultyDemoFallback(
            Array.isArray(courseData) ? courseData : [],
            facultyDemoCourses(),
            isEmptyArray,
          ),
        );
        setMentees(
          withFacultyDemoFallback(
            Array.isArray(menteeData) ? menteeData : [],
            facultyDemoMentees(),
            isEmptyArray,
          ),
        );
        setMeetings(
          withFacultyDemoFallback(
            Array.isArray(meetingData) ? meetingData : [],
            facultyDemoMeetings(user?.user_id),
            isEmptyArray,
          ),
        );
        setNotifications(
          withFacultyDemoFallback(
            Array.isArray(notifData) ? notifData : [],
            facultyDemoNotifications(user?.user_id),
            isEmptyArray,
          ).slice(0, 8),
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load dashboard');
          const demo = facultyDemoTodayClasses();
          setClasses(withFacultyDemoFallback([], demo, isEmptyArray));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, canManageTeam, activeDeptId, deptLoading, token, user?.user_id]);

  const attendanceHref = (c: FacultyClass) =>
    `/faculty/attendance?courseId=${encodeURIComponent(c.course_id)}`;

  async function actOnGatePass(passId: string, status: 'APPROVED' | 'REJECTED') {
    if (isFacultyDemoSmokeId(passId)) {
      setGatePassApprovals((prev) => prev.filter((pass) => pass.pass_id !== passId));
      return;
    }
    await api.patch(`/api/hr/gate-passes/${passId}/action`, { status });
    setGatePassApprovals((prev) => prev.filter((pass) => pass.pass_id !== passId));
  }

  const pendingCerts = pendingApprovals.certificates?.length ?? 0;
  const pendingMeetings = pendingApprovals.meetings?.length ?? 0;
  const pendingLeaves = pendingApprovals.leave_requests?.length ?? 0;
  const totalPending = pendingCerts + pendingMeetings + pendingLeaves + gatePassApprovals.length;

  const facultyName = profile?.display_name || profile?.name || user?.name || 'Faculty';
  const department = profile?.department || user?.department || '—';
  const designation = profile?.designation || user?.primaryRole || user?.role || 'Faculty';
  const employeeId = profile?.employee_id || '—';

  const semester = courses.find((c) => c.semester)?.semester ?? '—';
  const academicYear = courses.find((c) => c.academic_year)?.academic_year ?? '—';

  const meetingsToday = meetings.filter((m) => isSameDay(m.starts_at));
  const upcomingMeetings = [...meetings]
    .filter((m) => new Date(m.starts_at).getTime() >= Date.now() - 60 * 60 * 1000)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .slice(0, 5);

  const upcomingDuties = duties.slice(0, 5);
  const nextDutyDate = upcomingDuties[0]?.exam_date
    ? String(upcomingDuties[0].exam_date).slice(0, 10)
    : null;
  const activeTests = weeklyTests.filter((t) => t.is_active !== false).length;
  const pendingTasks = useMemo(
    () =>
      buildPendingTasks({
        missingAttendanceCount: missingAttendance.length,
        pendingCerts,
        pendingMeetings,
        pendingLeaves,
        activeTests,
        dutiesCount: duties.length,
        nextDutyDate,
        gatePassCount: gatePassApprovals.length,
        canManageTeam,
        coursesCount: courses.length,
      }),
    [
      missingAttendance.length,
      pendingCerts,
      pendingMeetings,
      pendingLeaves,
      activeTests,
      duties.length,
      nextDutyDate,
      gatePassApprovals.length,
      canManageTeam,
      courses.length,
    ],
  );
  const openTaskCount = pendingTasks.filter((t) => t.kind === 'open').length;
  const clearedTaskCount = pendingTasks.filter((t) => t.kind === 'cleared').length;
  const actionableTaskCount = pendingTasks.filter((t) => t.kind !== 'recommended').length;
  const taskProgressPct =
    actionableTaskCount === 0
      ? 100
      : Math.round((clearedTaskCount / actionableTaskCount) * 100);
  const highRisk = atRisk.filter((s) => s.risk_level === 'HIGH');
  const avgAttendance = useMemo(() => {
    const vals = atRisk.map((s) => s.metrics.attendance_percent).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [atRisk]);
  const avgMarks = useMemo(() => {
    const vals = atRisk.map((s) => s.metrics.grades_percent).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [atRisk]);

  const sortedClasses = [...classes].sort((a, b) => formatTime(a.start_time).localeCompare(formatTime(b.start_time)));

  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7; // Mon-start
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; isToday: boolean }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isToday: d === now.getDate(),
      });
    }
    return cells;
  }, []);

  return (
    <FacultyPageShell className="space-y-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-xl border border-border/70 bg-white p-4 shadow-sm sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-sgvu-gold/10 blur-2xl" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">Faculty Portal</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-sgvu-navy sm:text-3xl">
              {greetingForNow()}, {facultyName.split(' ')[0]}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {department} · {designation}
              {employeeId !== '—' ? ` · Emp ID ${employeeId}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-lg border border-border/60 bg-slate-50 px-2.5 py-1 font-medium text-sgvu-navy">
                {formatLongDate()}
              </span>
              <span className="rounded-lg border border-border/60 bg-slate-50 px-2.5 py-1 font-medium text-sgvu-navy">
                Semester {semester}
              </span>
              <span className="rounded-lg border border-border/60 bg-slate-50 px-2.5 py-1 font-medium text-sgvu-navy">
                AY {academicYear}
              </span>
              {hrSummary ? (
                <span className="rounded-lg border border-border/60 bg-slate-50 px-2.5 py-1 font-medium text-sgvu-navy">
                  Biometric In {hrSummary.display?.in_time ?? '—'} · Out {hrSummary.display?.out_time ?? '—'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { href: '/faculty/attendance', label: 'Mark Attendance', icon: ClipboardCheck },
                { href: '/faculty/timetable', label: 'Open Timetable', icon: CalendarClock },
                { href: '/faculty/courses', label: 'Course Page & DA', icon: ClipboardList },
                { href: '/faculty/ai-assistant', label: 'AI Assistant', icon: Sparkles },
              ] as const
            ).map((action) => (
              <Button key={action.href} asChild size="sm" className={dashActionClass}>
                <Link href={action.href}>
                  <action.icon className="mr-1.5 h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <MultiDepartmentTeachingSummary />

      {!complianceDismissed && profileCompliance?.needs_academic_profile ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Complete your Academic Profile</p>
              <p className="mt-0.5 text-amber-900/90">
                {profileCompliance.message ?? 'Please complete your Academic Profile for IQAC compliance.'}
              </p>
              <Link href="/faculty/profile" className="mt-2 inline-block font-medium text-sgvu-navy underline">
                Open My Profile →
              </Link>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-amber-800 hover:bg-amber-100"
            aria-label="Dismiss"
            onClick={() => {
              localStorage.setItem(PROFILE_COMPLIANCE_KEY, '1');
              setComplianceDismissed(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {error ? <FacultyErrorBanner message={error} /> : null}

      {/* Today only: classes + events */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiLink
          href="/faculty/timetable"
          label="Classes Today"
          value={loading ? '—' : classes.length}
          sub={
            classes.length === 1
              ? '1 teaching session scheduled'
              : `${classes.length} teaching sessions scheduled`
          }
          icon={CalendarClock}
          tone="gold"
        />
        <KpiLink
          href="/faculty/meetings"
          label="Today's Events"
          value={loading ? '—' : meetingsToday.length}
          sub={
            meetingsToday.length === 0
              ? 'No meetings or events today'
              : meetingsToday.length === 1
                ? '1 meeting / event today'
                : `${meetingsToday.length} meetings / events today`
          }
          icon={CalendarDays}
          tone="navy"
        />
      </div>

      {/* Schedule + summary */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <CardShell
          title="Today's Schedule"
          description="Timeline of classes — red means attendance still needed"
          count={classes.length}
          tone={missingAttendance.length > 0 ? 'alert' : 'default'}
          action={
            <Link href="/faculty/timetable" className="text-xs font-semibold text-sgvu-navy hover:underline">
              Full timetable →
            </Link>
          }
        >
          {loading ? <FacultyInlineLoading label="Loading schedule…" /> : null}
          {!loading && classes.length === 0 ? (
            <FacultyEmptyState
              title="No classes today"
              description="Your timetable has no sessions scheduled for today."
            />
          ) : null}
          {!loading && sortedClasses.length > 0 ? (
            <ol className="relative space-y-3 border-l-2 border-sgvu-navy/15 pl-4">
              {sortedClasses.map((c) => {
                const needsMark = missingAttendance.some((m) => m.timetable_id === c.timetable_id);
                return (
                  <li key={c.timetable_id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[1.4rem] top-3 h-2.5 w-2.5 rounded-full border-2 border-white shadow',
                        needsMark ? 'animate-pulse bg-red-500' : 'bg-emerald-500',
                      )}
                    />
                    <div
                      className={cn(
                        'flex flex-col gap-3 rounded-xl border p-3.5 transition sm:flex-row sm:items-center sm:justify-between',
                        needsMark
                          ? 'border-red-200 bg-red-50/50 hover:border-red-300'
                          : 'border-border/60 bg-slate-50/50 hover:border-sgvu-gold/40',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold tabular-nums text-sgvu-navy">
                            {formatTime(c.start_time)} – {formatTime(c.end_time)}
                          </p>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold',
                              needsMark
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700',
                            )}
                          >
                            {needsMark ? 'Needs marking' : 'Attendance ready'}
                          </span>
                        </div>
                        <p className="mt-0.5 font-semibold text-sgvu-navy">
                          {c.course_code} · {c.course_name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Room {c.room ?? 'TBA'}
                          {c.section ? ` · Sec ${c.section}` : ''} · {c.student_count} students
                        </p>
                      </div>
                      <Button asChild size="sm" className={cn('shrink-0', dashActionClass)}>
                        <Link href={attendanceHref(c)}>
                          {needsMark ? 'Mark attendance' : 'Open attendance'}
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </CardShell>

        <div className="space-y-4">
          <CardShell title="Faculty Summary" description="Today's work at a glance">
            <ul className="space-y-2.5 text-sm">
              {[
                { label: 'Attendance pending', value: missingAttendance.length, href: '/faculty/attendance', alert: missingAttendance.length > 0 },
                { label: 'Assignments / tests', value: activeTests, href: '/faculty/weekly-tests' },
                { label: 'Meetings today', value: meetingsToday.length, href: '/faculty/meetings' },
                { label: 'Approvals waiting', value: totalPending, href: '/faculty/mentorship', alert: totalPending > 0 },
                { label: 'Leave requests', value: pendingLeaves, href: '/faculty/inbox' },
                { label: 'Mentees', value: mentees.length || profile?.active_mentees || 0, href: '/faculty/mentorship' },
              ].map((row) => (
                <li key={row.label}>
                  <Link
                    href={row.href}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 transition hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5"
                  >
                    <span className="text-sgvu-navy/90">{row.label}</span>
                    <span className={cn('font-bold tabular-nums', row.alert ? 'text-red-600' : 'text-sgvu-navy')}>
                      {loading ? '—' : row.value}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardShell>

          <CardShell title="Mini Calendar" description={new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={`${d}-${i}`}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-md text-xs',
                    cell.day == null && 'opacity-0',
                    cell.isToday && 'bg-sgvu-navy font-bold text-sgvu-gold',
                    cell.day != null && !cell.isToday && 'text-sgvu-navy hover:bg-slate-100',
                  )}
                >
                  {cell.day}
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <p>
                <span className="font-semibold text-sgvu-navy">{classes.length}</span> classes ·{' '}
                <span className="font-semibold text-sgvu-navy">{meetingsToday.length}</span> meetings ·{' '}
                <span className="font-semibold text-sgvu-navy">{duties.length}</span> exam duties
              </p>
            </div>
          </CardShell>
        </div>
      </div>

      {/* Student performance + pending tasks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CardShell
          title="Student Performance"
          description="Who needs mentoring — tap a student to open analytics"
          tone={highRisk.length > 0 ? 'alert' : 'default'}
          action={
            <Button asChild size="sm" className={dashActionClass}>
              <Link href="/faculty/at-risk">View all</Link>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: 'Avg attendance',
                value: avgAttendance != null ? `${avgAttendance}%` : '—',
                warn: avgAttendance != null && avgAttendance < 75,
              },
              {
                label: 'Avg marks',
                value: avgMarks != null ? `${avgMarks}%` : '—',
                warn: avgMarks != null && avgMarks < 40,
              },
              { label: 'At-risk', value: atRisk.length, warn: atRisk.length > 0 },
              { label: 'High risk', value: highRisk.length, warn: highRisk.length > 0 },
            ].map((m) => (
              <div
                key={m.label}
                className={cn(
                  'rounded-xl border p-3 text-center',
                  m.warn ? 'border-red-200 bg-red-50/60' : 'border-border/60 bg-slate-50/80',
                )}
              >
                <p
                  className={cn(
                    'text-lg font-black tabular-nums',
                    m.warn ? 'text-red-700' : 'text-sgvu-navy',
                  )}
                >
                  {loading ? '—' : m.value}
                </p>
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {atRisk.slice(0, 4).map((s) => (
              <Link
                key={s.user_id}
                href={`/faculty/analytics?q=${encodeURIComponent(s.name)}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sgvu-navy">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Att {s.metrics.attendance_percent ?? '—'}% · Marks {s.metrics.grades_percent ?? '—'}%
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={s.risk_level === 'HIGH' ? 'destructive' : 'secondary'}>{s.risk_level}</Badge>
                  <span className={cn('rounded-md px-2 py-1 text-[11px] font-semibold', dashActionClass)}>
                    Action
                  </span>
                </div>
              </Link>
            ))}
            {!loading && atRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">No at-risk students flagged in your batches.</p>
            ) : null}
          </div>
        </CardShell>

        <CardShell
          title="Pending Tasks"
          description={`${openTaskCount} open · tap any row to act immediately`}
          count={openTaskCount}
          tone={openTaskCount > 0 ? 'alert' : 'success'}
        >
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {clearedTaskCount} of {actionableTaskCount} cleared
              </span>
              <span className="tabular-nums">{taskProgressPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold transition-all duration-500"
                style={{ width: `${taskProgressPct}%` }}
              />
            </div>
          </div>

          {openTaskCount === 0 ? (
            <div className="mb-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-3">
              <p className="text-sm font-semibold text-emerald-900">You’re clear for now</p>
              <p className="mt-0.5 text-[11px] text-emerald-800/90">
                No urgent attendance, approvals, or exam duties are waiting.
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold">
                <Link href="/faculty/timetable" className="text-sgvu-navy hover:underline">
                  Open timetable →
                </Link>
                <Link href="/faculty/courses" className="text-sgvu-navy hover:underline">
                  Course workspaces →
                </Link>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {pendingTasks.map((task) => (
              <PendingTaskRow key={task.id} task={task} />
            ))}
          </div>
        </CardShell>
      </div>

      {/* Events + Research */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CardShell title="Upcoming Events" description="Meetings, exam duties, and deadlines" count={upcomingMeetings.length + upcomingDuties.length}>
          <div className="space-y-2">
            {upcomingMeetings.map((m) => (
              <Link
                key={m.meeting_id}
                href="/faculty/meetings"
                className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5 transition hover:border-sgvu-gold/40"
              >
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-navy" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-sgvu-navy">{m.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Meeting · {new Date(m.starts_at).toLocaleString()} · {m.venue}
                  </p>
                </div>
              </Link>
            ))}
            {upcomingDuties.map((d) => (
              <Link
                key={d.assignment_id}
                href="/faculty/invigilation"
                className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5 transition hover:border-sgvu-gold/40"
              >
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-sgvu-navy">{d.exam_name ?? 'Exam duty'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Exam · {d.exam_date ? String(d.exam_date).slice(0, 10) : 'Date TBA'} · Room {d.room ?? 'TBA'}
                  </p>
                </div>
              </Link>
            ))}
            {!loading && upcomingMeetings.length === 0 && upcomingDuties.length === 0 ? (
              <FacultyEmptyState description="No upcoming meetings or exam duties in your queue." />
            ) : null}
          </div>
        </CardShell>

        <CardShell
          title="Research Dashboard"
          description="Publications and research activity"
          action={
            <Link href="/faculty/research" className="text-xs font-semibold text-sgvu-navy hover:underline">
              Open research →
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border/60 p-3 text-center">
              <p className="text-xl font-black text-sgvu-navy">{research.length}</p>
              <p className="text-[10px] text-muted-foreground">Publications</p>
            </div>
            <div className="rounded-xl border border-border/60 p-3 text-center">
              <p className="text-xl font-black text-sgvu-navy">{research.filter((r) => /project/i.test(r.publication_type ?? '')).length}</p>
              <p className="text-[10px] text-muted-foreground">Projects</p>
            </div>
            <Link
              href="/faculty/research-approvals"
              className="rounded-xl border border-border/60 p-3 text-center transition hover:border-sgvu-gold/40"
            >
              <p className="text-sm font-black text-sgvu-navy">Open</p>
              <p className="text-[10px] text-muted-foreground">Grants</p>
            </Link>
            <Link
              href="/faculty/phd/scholars"
              className="rounded-xl border border-border/60 p-3 text-center transition hover:border-sgvu-gold/40"
            >
              <p className="text-sm font-black text-sgvu-navy">Open</p>
              <p className="text-[10px] text-muted-foreground">PhD students</p>
            </Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {research.slice(0, 4).map((r, i) => (
              <div key={r.research_id ?? r.log_id ?? i} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
                <p className="truncate font-medium text-sgvu-navy">
                  {r.publication_title ?? r.title ?? 'Research entry'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {r.publication_type ?? 'Publication'} · {r.status ?? 'Logged'}
                </p>
              </div>
            ))}
            {!loading && research.length === 0 ? (
              <p className="text-sm text-muted-foreground">No research logs yet — add publications from Research.</p>
            ) : null}
          </div>
        </CardShell>
      </div>

      {/* Approvals + Notifications */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CardShell
          title="Approvals"
          description="Tap a tile to open that queue — numbers in red need action"
          count={totalPending}
          tone={totalPending > 0 ? 'alert' : 'default'}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Mentorship certificates', value: pendingCerts, href: '/faculty/mentorship' },
              { label: 'Leave requests', value: pendingLeaves, href: canManageTeam ? '/faculty/inbox' : '/faculty/me/workforce' },
              { label: 'Meeting requests', value: pendingMeetings, href: '/faculty/mentorship' },
              { label: 'Gate passes', value: gatePassApprovals.length, href: '/faculty/inbox' },
              { label: 'Event approvals', value: null as number | null, href: '/faculty/event-approvals' },
              { label: 'Project / grants', value: null as number | null, href: '/faculty/research-approvals' },
            ].map((item) => {
              const needsAction = typeof item.value === 'number' && item.value > 0;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'group rounded-xl border px-3 py-3 transition hover:-translate-y-0.5 hover:shadow-sm active:bg-sgvu-gold/20',
                    needsAction
                      ? 'border-red-200 bg-red-50/50 hover:border-red-300'
                      : 'border-border/60 hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        'text-lg font-black tabular-nums',
                        needsAction ? 'text-red-700' : 'text-sgvu-navy',
                      )}
                    >
                      {item.value == null ? 'Open' : item.value}
                    </p>
                    <span className="text-[10px] font-semibold text-sgvu-navy opacity-0 transition group-hover:opacity-100">
                      Go →
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                </Link>
              );
            })}
          </div>

          {canManageTeam && gatePassApprovals.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Gate passes awaiting you</p>
              {gatePassApprovals.map((pass) => (
                <div key={pass.pass_id} className="rounded-xl border border-border/60 p-3 text-sm">
                  <p className="font-medium text-sgvu-navy">{pass.staff?.name ?? 'Staff member'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pass.out_time).toLocaleString()} · {pass.reason}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void actOnGatePass(pass.pass_id, 'APPROVED')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void actOnGatePass(pass.pass_id, 'REJECTED')}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardShell>

        <CardShell
          title="Recent Notifications"
          description="Circulars, exam, IQAC, research, and HR alerts"
          action={
            <Link href="/notifications" className="text-xs font-semibold text-sgvu-navy hover:underline">
              All →
            </Link>
          }
        >
          <div className="space-y-2">
            {notifications.map((n) => (
              <Link
                key={n.notification_id}
                href={n.action_link || '/notifications'}
                className={cn(
                  'flex gap-3 rounded-lg border px-3 py-2.5 transition hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5',
                  n.is_read ? 'border-border/60 bg-white' : 'border-sgvu-gold/40 bg-sgvu-gold/5',
                )}
              >
                <Mail className={cn('mt-0.5 h-4 w-4 shrink-0', n.is_read ? 'text-slate-400' : 'text-sgvu-gold')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-sgvu-navy">{n.title}</p>
                    {!n.is_read ? (
                      <span className="shrink-0 rounded-full bg-sgvu-navy px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {n.category} · {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </Link>
            ))}
            {!loading && notifications.length === 0 ? (
              <FacultyEmptyState description="No recent notifications." />
            ) : null}
          </div>
        </CardShell>
      </div>

    </FacultyPageShell>
  );
}
