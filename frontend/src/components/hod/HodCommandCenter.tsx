'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Inbox,
  Loader2,
  RefreshCw,
  Users,
  Plus,
  Check,
  X,
  FileSpreadsheet,
  ArrowRightLeft,
  ShieldCheck,
  Fingerprint,
  ChevronDown,
  Download,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrAvatar } from '@/components/hr/HrAvatar';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { FalconLoader } from '@/components/brand/FalconLoader';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { downloadAuthedFile } from '@/lib/hod-download';
import { HodCompiledResultsPanel } from '@/components/hod/HodCompiledResultsPanel';
import { HodPlacementPanel } from '@/components/hod/HodPlacementPanel';
import { HodStaffRolesPanel } from '@/components/hod/HodStaffRolesPanel';
import { HodAcademicCalendarPanel } from '@/components/hod/HodAcademicCalendarPanel';
import { cn } from '@/lib/utils';
import { TodayBirthdaysWidget } from '@/components/dashboard/TodayBirthdaysWidget';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type HealthMetrics = {
  total_faculty: number;
  faculty_present_today: number;
  faculty_on_leave_today: number;
  total_students: number;
  classes_scheduled_today: number;
  classes_cancelled_today: number;
  classes_rescheduled_today: number;
  average_attendance: number;
  attendance_trend_pct: number;
  attendance_trend_label: string;
  pending_leave_count: number;
  pending_gate_pass_count: number;
  pending_profile_corrections: number;
  pending_inbox_total: number;
};

type SyllabusRow = {
  course_code: string;
  course_name: string;
  faculty_name: string;
  coverage_percent: number;
  behind_schedule: boolean;
  days_behind?: number;
};

type InboxRow = {
  id: string;
  type: string;
  title: string;
  employee_name: string;
  date_label: string;
  detail: string;
};

type DeficitRow = {
  user_id: string;
  name: string;
  email: string;
  average_attendance: number;
  course_count: number;
};

type CommandCenterPayload = {
  health_metrics: HealthMetrics;
  syllabus_coverage: SyllabusRow[];
  pending_inbox: InboxRow[];
  attendance_deficits: DeficitRow[];
};

function useIstClock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      setNow(
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }).format(new Date()),
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function SampleDataBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
      <span className="font-bold uppercase tracking-wider text-[10px] text-amber-700 mr-2">Preview</span>
      {message}
    </div>
  );
}

function ProgressBar({ pct, muted }: { pct: number; muted?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div
        className={cn('h-full rounded-full', muted ? 'bg-sgvu-navy/40' : 'bg-sgvu-gold')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Course handover + drill-down types
interface AssignedCourse {
  allocation_id: string;
  course_id: string | null;
  subject_code: string;
  subject_name: string;
  subject_type: string;
  credits: number;
  program_name: string;
  semester: string;
  academic_year: string;
  faculty_user_id: string;
  faculty_name: string;
}

type HandoverFacultyOption = { user_id: string; name: string; email: string };

type DepartmentTimetableRow = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  faculty_user_id: string;
  faculty_name: string;
};

interface AuditRecord {
  id: string;
  facultyName: string;
  facultyId?: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  pptsUploaded: number;
  totalClasses?: number;
  classesConducted?: number;
  attendanceMarked: number;
  attendanceMissingClasses?: string[];
  attendanceStatusLabel?: 'All Marked' | 'Missed Class' | 'No Class Today' | 'Upcoming Class' | 'N/A';
  marksUploaded: {
    ga: boolean;
    wt: boolean;
    labs: boolean;
    theory: boolean;
  };
  marksStatus: 'OPEN' | 'LOCKED' | 'EDIT_REQUESTED' | 'N/A';
  editRequestReason?: string;
}

interface FacultyRosterItem {
  user_id: string;
  name: string;
  email: string;
  department: string | null;
  role: string | null;
}

interface LivePunchRecord {
  id: string;
  facultyName: string;
  punchIn: string | null;
  punchOut: string | null;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';
  totalHours?: string;
}

type AttendanceMatrixDay = {
  date: string;
  bottom_line: string;
  calculated_status?: string;
};

function getIstDayOfWeek(): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 7,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 1;
}

function formatTimetableTime(value: string) {
  return value?.slice(0, 5) ?? value;
}

function mapMatrixToTodayPunches(
  employees: Array<{ user_id: string; name: string; days: AttendanceMatrixDay[] }>,
): LivePunchRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return employees.flatMap((emp) => {
    const day = emp.days.find((d) => d.date === today);
    if (!day || day.bottom_line === 'Week Off' || day.bottom_line === 'Holiday') {
      return [];
    }

    let status: LivePunchRecord['status'] = 'PRESENT';
    if (day.bottom_line === 'Absent') status = 'ABSENT';
    else if (day.bottom_line.startsWith('Leave')) status = 'LEAVE';
    else if (day.calculated_status === 'HALF_DAY') status = 'HALF_DAY';

    const timeMatch = day.bottom_line.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    const record: LivePunchRecord = {
      id: emp.user_id,
      facultyName: emp.name,
      punchIn: timeMatch?.[1] ?? null,
      punchOut: timeMatch?.[2] ?? null,
      status,
      totalHours: timeMatch ? undefined : status === 'PRESENT' ? 'Active' : undefined,
    };
    return [record];
  });
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const HOD_DASHBOARD_TABS = ['overview', 'audit', 'results', 'placement'] as const;
type HodDashboardTab = (typeof HOD_DASHBOARD_TABS)[number];

function isHodDashboardTab(value: string | null): value is HodDashboardTab {
  return !!value && HOD_DASHBOARD_TABS.includes(value as HodDashboardTab);
}

export function HodCommandCenter() {
  const api = useAuthedApi();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<HodDashboardTab>(
    isHodDashboardTab(tabParam) ? tabParam : 'overview',
  );

  useEffect(() => {
    if (isHodDashboardTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const departmentLabel = user?.department ? `Department of ${user.department}` : 'Your department';
  const istNow = useIstClock();
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [unassignedLoad, setUnassignedLoad] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [assignedCourses, setAssignedCourses] = useState<AssignedCourse[]>([]);
  const [handoverFaculty, setHandoverFaculty] = useState<HandoverFacultyOption[]>([]);
  const [departmentTimetable, setDepartmentTimetable] = useState<DepartmentTimetableRow[]>([]);
  const [handoverCourse, setHandoverCourse] = useState<AssignedCourse | null>(null);
  const [handoverTargetFacultyId, setHandoverTargetFacultyId] = useState('');
  const [handoverSaving, setHandoverSaving] = useState(false);

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [selectedAuditRequest, setSelectedAuditRequest] = useState<AuditRecord | null>(null);
  const [isAuditSheetOpen, setIsAuditSheetOpen] = useState(false);
  const [selectedMissedAttendance, setSelectedMissedAttendance] = useState<AuditRecord | null>(null);
  const [sendingAttendanceAlert, setSendingAttendanceAlert] = useState(false);
  const [auditExporting, setAuditExporting] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState<number | 'ALL'>('ALL');
  const [expandedFacultyIds, setExpandedFacultyIds] = useState<Set<string>>(new Set());

  const toggleFacultyExpansion = (facultyId: string) => {
    setExpandedFacultyIds((prev) => {
      const next = new Set(prev);
      if (next.has(facultyId)) {
        next.delete(facultyId);
      } else {
        next.add(facultyId);
      }
      return next;
    });
  };

  const [punches, setPunches] = useState<LivePunchRecord[]>([]);
  const [disputePunchId, setDisputePunchId] = useState<string | null>(null);
  const [isDisputeDialogOpen, setIsDisputeDialogOpen] = useState(false);

  const [drillDownType, setDrillDownType] = useState<'faculty' | 'classes' | 'attendance' | 'inbox' | 'redflags' | 'syllabus' | null>(null);
  const [realFaculty, setRealFaculty] = useState<FacultyRosterItem[]>([]);

  const todayClasses = useMemo(
    () => departmentTimetable.filter((row) => row.day_of_week === getIstDayOfWeek()),
    [departmentTimetable],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [payload, unassigned, roster, audits, attendanceMatrix, assigned, timetable] =
          await Promise.all([
          api.get<CommandCenterPayload>('/api/academics/hod/command-center'),
          api.get<{ count: number }>('/api/academics/hod/teaching-load/unassigned/count').catch(() => ({ count: 0 })),
          api.get<FacultyRosterItem[]>('/api/academics/hod/faculty-roster').catch(() => []),
          api.get<AuditRecord[]>('/api/academics/hod/faculty-audit').catch(() => []),
          api
            .get<{ employees: Array<{ user_id: string; name: string; days: AttendanceMatrixDay[] }> }>(
              `/api/hr/ess/team/attendance?scope=dept&month=${new Date().toISOString().slice(0, 7)}`,
            )
            .catch(() => null),
          api
            .get<{ items: AssignedCourse[]; faculty: HandoverFacultyOption[] }>(
              '/api/academics/hod/teaching-load/assigned',
            )
            .catch(() => ({ items: [], faculty: [] })),
          api.get<DepartmentTimetableRow[]>('/api/academics/hod/department-timetable').catch(() => []),
        ]);
        setData(payload);
        setUnassignedLoad(unassigned.count);
        setRealFaculty(roster);
        setAssignedCourses(assigned.items);
        setHandoverFaculty(assigned.faculty);
        setDepartmentTimetable(timetable);
        if (audits && audits.length > 0) {
          setAuditRecords(audits);
        } else {
          setAuditRecords([]);
        }
        setPunches(
          attendanceMatrix?.employees?.length
            ? mapMatrixToTodayPunches(attendanceMatrix.employees)
            : [],
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load command center');
        if (!silent) setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const refreshTodayPunches = async () => {
      try {
        const today = await api.get<{
          employees: Array<{ user_id: string; name: string; bottom_line: string; status: string }>;
        }>('/api/hr/ess/team/attendance/today?scope=dept');
        if (cancelled || !today?.employees?.length) return;
        setPunches(
          today.employees.map((e) => {
            let status: LivePunchRecord['status'] = 'PRESENT';
            if (e.bottom_line?.startsWith('Leave')) status = 'LEAVE';
            else if (e.status === 'ABSENT' || e.bottom_line === 'Not punched in') status = 'ABSENT';
            const timeMatch = e.bottom_line?.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
            return {
              id: e.user_id,
              facultyName: e.name,
              punchIn: timeMatch?.[1] ?? null,
              punchOut: timeMatch?.[2] ?? null,
              status,
            };
          }),
        );
      } catch {
        /* keep last snapshot */
      }
    };
    void refreshTodayPunches();
    const timer = window.setInterval(() => void refreshTodayPunches(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api]);

  async function actOnInbox(row: InboxRow, action: 'APPROVE' | 'REJECT') {
    setActingId(row.id);
    const previous = data;
    if (previous) {
      setData({
        ...previous,
        pending_inbox: previous.pending_inbox.filter((item) => item.id !== row.id),
        health_metrics: {
          ...previous.health_metrics,
          pending_inbox_total: Math.max(0, previous.health_metrics.pending_inbox_total - 1),
          pending_leave_count:
            row.type === 'LEAVE'
              ? Math.max(0, previous.health_metrics.pending_leave_count - 1)
              : previous.health_metrics.pending_leave_count,
          pending_gate_pass_count:
            row.type === 'GATE_PASS'
              ? Math.max(0, previous.health_metrics.pending_gate_pass_count - 1)
              : previous.health_metrics.pending_gate_pass_count,
        },
      });
    }
    try {
      if (row.type === 'LEAVE') {
        if (action === 'REJECT') {
          const comment = window.prompt('Reason for rejection (shown to employee)?');
          if (!comment || comment.length < 3) {
            if (previous) setData(previous);
            toast.error('A short reason is required');
            setActingId(null);
            return;
          }
          await api.patch('/api/hr/ess/team/requests/bulk', {
            ids: [row.id],
            action: 'REJECT',
            comment,
            tab: 'LEAVE',
          });
        } else {
          await api.patch('/api/hr/ess/team/requests/bulk', {
            ids: [row.id],
            action: 'APPROVE',
            tab: 'LEAVE',
          });
        }
      } else if (row.type === 'GATE_PASS') {
        await api.patch(`/api/hr/gate-passes/${row.id}/action`, {
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        });
      } else {
        await api.patch(`/api/academics/hod/approvals/extra-classes/${row.id}`, {
          action,
          remarks: action === 'REJECT' ? 'Rejected from HOD dashboard' : undefined,
        });
      }
      toast.success(action === 'APPROVE' ? 'Approved' : 'Rejected');
      void load(true);
    } catch (e) {
      if (previous) setData(previous);
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  }

  async function exportAuditReport(facultyUserId?: string) {
    if (!token) {
      toast.error('Please sign in to download');
      return;
    }
    setAuditExporting(true);
    try {
      const qs = facultyUserId ? `?faculty_user_id=${facultyUserId}` : '';
      await downloadAuthedFile(
        `/api/academics/hod/faculty-audit/export${qs}`,
        token,
        facultyUserId ? 'faculty-audit-report.xlsx' : 'all-faculty-audit.xlsx',
      );
      toast.success('Audit report downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setAuditExporting(false);
    }
  }

  const facultyPulse = useMemo(() => {
    if (!data) return null;
    const m = data.health_metrics;
    const total = Math.max(m.total_faculty, 1);
    return {
      presentPct: Math.round((m.faculty_present_today / total) * 100),
      leavePct: Math.round((m.faculty_on_leave_today / total) * 100),
      otherPct: Math.max(0, 100 - Math.round((m.faculty_present_today / total) * 100) - Math.round((m.faculty_on_leave_today / total) * 100)),
      ...m,
    };
  }, [data]);

  if (loading) {
    return (
      <HodPageFrame>
        <FalconLoader label="Loading Department Command Center…" className="min-h-[40vh]" />
      </HodPageFrame>
    );
  }

  if (!data) {
    return (
      <HodPageFrame>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="font-semibold text-sgvu-navy">Command center unavailable</p>
          <Button className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </HodPageFrame>
    );
  }

  const m = data.health_metrics;
  const behindSyllabus = data.syllabus_coverage.filter((r) => r.behind_schedule);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Department Command Center"
        description={`Academic health, faculty operations, and pending approvals for ${departmentLabel}.`}
        meta={
          <>
            <span className="rounded-md border border-sgvu-gold/30 bg-sgvu-gold/10 px-2.5 py-0.5 text-xs font-bold text-sgvu-navy">
              {departmentLabel}
            </span>
            <span>·</span>
            <span className="font-medium text-sgvu-navy tabular-nums">{istNow || '—'} IST</span>
            <span>·</span>
            <span>{m.total_students} students</span>
            <span>·</span>
            <span>{m.total_faculty} faculty</span>
            <span>·</span>
            <span>{m.pending_inbox_total} pending sign-offs</span>
            {facultyPulse ? (
              <>
                <span>·</span>
                <span>
                  {facultyPulse.faculty_present_today} present, {facultyPulse.faculty_on_leave_today} on leave,{' '}
                  {facultyPulse.classes_scheduled_today} classes today
                </span>
              </>
            ) : null}
          </>
        }
        actions={
          <Button
            size="default"
            variant="outline"
            className="h-9 gap-2 text-sm text-sgvu-navy"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {unassignedLoad > 0 ? (
        <Link
          href="/hod/academics/teaching-load"
          className="block rounded-xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm transition-colors hover:bg-red-100/80"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <p className="font-semibold text-red-800">
                  {unassignedLoad} Subject{unassignedLoad === 1 ? '' : 's'} Unassigned
                </p>
                <p className="text-sm text-red-700/90">
                  NF rows from the Course Allocation Matrix need faculty assignment.
                </p>
              </div>
            </div>
            <span className="text-sm font-medium text-red-800">Assign →</span>
          </div>
        </Link>
      ) : null}

      {facultyPulse ? (
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-sgvu-navy">Faculty pulse today</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-sgvu-gold" style={{ width: `${facultyPulse.presentPct}%` }} />
            <div className="bg-sgvu-navy/40" style={{ width: `${facultyPulse.leavePct}%` }} />
            <div className="bg-slate-200" style={{ width: `${facultyPulse.otherPct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sgvu-gold" />
              Present {facultyPulse.presentPct}%
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sgvu-navy/40" />
              On leave {facultyPulse.leavePct}%
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              Unmarked {facultyPulse.otherPct}%
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HrStatCard
          label="Total Faculty"
          value={m.total_faculty}
          sub={`${m.faculty_on_leave_today} on leave today`}
          icon={Users}
          accent="navy"
          onClick={() => setDrillDownType('faculty')}
        />
        <HrStatCard
          label="Classes Today"
          value={m.classes_scheduled_today}
          sub={`${m.classes_cancelled_today} cancelled · ${m.classes_rescheduled_today} rescheduled`}
          icon={CalendarClock}
          accent="gold"
          alert={m.classes_cancelled_today > 0}
          onClick={() => setDrillDownType('classes')}
        />
        <HrStatCard
          label="Dept Attendance"
          value={`${m.average_attendance}%`}
          icon={GraduationCap}
          trend={m.attendance_trend_pct}
          trendLabel={m.attendance_trend_label}
          alert={m.average_attendance < 75}
          onClick={() => setDrillDownType('attendance')}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = value as HodDashboardTab;
          setActiveTab(next);
          router.replace(`/hod/dashboard?tab=${next}`, { scroll: false });
        }}
        className="w-full mt-6 space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg font-semibold py-2">Dashboard Overview</TabsTrigger>
          <TabsTrigger value="audit" className="rounded-lg font-semibold py-2">Faculty Progress Audit</TabsTrigger>
          <TabsTrigger value="results" className="rounded-lg font-semibold py-2">Compiled Results</TabsTrigger>
          <TabsTrigger value="placement" className="rounded-lg font-semibold py-2">Placement Attendance</TabsTrigger>
        </TabsList>

        {/* Tab 1: Dashboard Overview */}
        <TabsContent value="overview" className="space-y-6 outline-none">
          <div className="grid gap-4 lg:grid-cols-12">
            <HodPanel
              title="Syllabus Coverage"
              count={data.syllabus_coverage.length}
              className="lg:col-span-4"
            >
              {data.syllabus_coverage.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No LMS modules yet.</p>
              ) : (
                <ul className="max-h-[360px] space-y-3 overflow-y-auto">
                  {data.syllabus_coverage.map((row) => (
                    <li
                      key={`${row.course_code}-${row.faculty_name}`}
                      className={cn(
                        'rounded-lg border px-4 py-3',
                        row.behind_schedule ? 'border-sgvu-gold/50 bg-sgvu-gold/5' : 'border-gray-100 bg-slate-50/50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-sgvu-navy">{row.course_code}</p>
                          <p className="truncate text-sm text-muted-foreground">{row.faculty_name}</p>
                        </div>
                        <span className="text-lg font-bold tabular-nums text-sgvu-navy">{row.coverage_percent}%</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar pct={row.coverage_percent} muted={row.behind_schedule} />
                      </div>
                      {row.behind_schedule ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Behind schedule — {row.coverage_percent}% complete
                          {row.days_behind ? ` · ${row.days_behind} days behind planned syllabus` : ''}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </HodPanel>

            <HodPanel
              title="Pending Approvals"
              count={data.pending_inbox.length}
              className="lg:col-span-5"
            >
              {data.pending_inbox.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CheckCircle2 className="h-10 w-10 text-sgvu-gold" />
                  <p className="text-sm font-semibold text-sgvu-navy">Inbox clear</p>
                  <p className="text-sm text-muted-foreground">No pending sign-offs right now.</p>
                </div>
              ) : (
                <ul className="max-h-[360px] space-y-3 overflow-y-auto">
                  {data.pending_inbox.slice(0, 10).map((row) => {
                    const busy = actingId === row.id;
                    return (
                      <li
                        key={`${row.type}-${row.id}`}
                        className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
                      >
                        <span className="mt-1 h-auto w-1 shrink-0 self-stretch rounded-full bg-sgvu-gold" />
                        <HrAvatar name={row.employee_name} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-sgvu-navy">{row.employee_name}</p>
                            <span className="rounded-md border border-gray-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              {row.title}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{row.detail}</p>
                          <p className="mt-1 text-sm tabular-nums text-muted-foreground">{row.date_label}</p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Button
                            size="default"
                            className="h-9 bg-sgvu-navy px-4 text-sm hover:bg-sgvu-navy/90"
                            disabled={busy}
                            onClick={() => void actOnInbox(row, 'APPROVE')}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                          </Button>
                          <Button
                            size="default"
                            variant="outline"
                            className="h-9 px-4 text-sm text-sgvu-navy"
                            disabled={busy}
                            onClick={() => void actOnInbox(row, 'REJECT')}
                          >
                            Reject
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </HodPanel>

            <HodPanel
              title="Attendance Red Flags"
              count={data.attendance_deficits.length}
              className="lg:col-span-3"
            >
              {data.attendance_deficits.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No students below 75%.</p>
              ) : (
                <ul className="space-y-3">
                  {data.attendance_deficits.map((row, idx) => (
                    <li
                      key={row.user_id}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-slate-50/50 px-4 py-3"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sgvu-navy text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-sgvu-navy">{row.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{row.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums text-sgvu-navy">{row.average_attendance}%</p>
                        <p className="text-sm text-muted-foreground">{row.course_count} courses</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </HodPanel>
          </div>

          {(m.pending_profile_corrections ?? 0) > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-5 py-4 mt-4 shadow-sm">
            <p className="text-sm text-sgvu-navy">
              <span className="font-bold text-sgvu-navy">{m.pending_profile_corrections}</span> profile correction{m.pending_profile_corrections === 1 ? '' : 's'} pending review — open <span className="font-semibold">Profile Corrections</span> from the sidebar.
            </p>
          </div>
          ) : null}

          <TodayBirthdaysWidget
            className="mt-4 shadow-sm"
            endpoint="/api/master-data/birthdays/faculty/department?scope=hod"
            title="Faculty Birthdays Today"
          />

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <HodAcademicCalendarPanel />
            <HodStaffRolesPanel />
          </div>
        </TabsContent>



        <TabsContent value="audit" className="space-y-6 outline-none">
          <SampleDataBanner message="Faculty audit rows load from LMS allocations when faculty-audit API returns data. Empty state means no syllabus allocations synced yet — not a system error." />
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Faculty progress audit section */}
            <div className="lg:col-span-8 rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-sgvu-navy">Faculty Progress & Marks Audit</h3>
                  <p className="text-sm text-muted-foreground">Monitor syllabus, PPT uploads, and grade lock statuses.</p>
                </div>
                
                {/* Semester Choice Dropdown Selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="sem-select" className="text-xs font-bold text-sgvu-navy whitespace-nowrap uppercase tracking-wider">Choose Sem:</label>
                  <select
                    id="sem-select"
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sgvu-navy shadow-sm transition-all"
                    value={selectedSemester}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSemester(val === 'ALL' ? 'ALL' : Number(val));
                    }}
                  >
                    <option value="ALL">All Semesters</option>
                    <option value="1">Semester 1 (I)</option>
                    <option value="2">Semester 2 (II)</option>
                    <option value="3">Semester 3 (III)</option>
                    <option value="4">Semester 4 (IV)</option>
                    <option value="5">Semester 5 (V)</option>
                    <option value="6">Semester 6 (VI)</option>
                    <option value="7">Semester 7 (VII)</option>
                    <option value="8">Semester 8 (VIII)</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditExporting}
                    className="gap-1.5"
                    onClick={() => void exportAuditReport()}
                  >
                    {auditExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Export all faculty
                  </Button>
                </div>
              </div>

              {/* Grouping and filtering logic */}
              {(() => {
                const filteredAudits = auditRecords.filter((rec) => {
                  if (selectedSemester === 'ALL') return true;
                  return rec.semester === selectedSemester;
                });

                interface FacultyGroup {
                  facultyId: string;
                  facultyName: string;
                  records: AuditRecord[];
                }

                const groupsMap = new Map<string, FacultyGroup>();
                for (const rec of filteredAudits) {
                  const facId = rec.facultyId || rec.facultyName;
                  if (!groupsMap.has(facId)) {
                    groupsMap.set(facId, {
                      facultyId: facId,
                      facultyName: rec.facultyName,
                      records: [],
                    });
                  }
                  groupsMap.get(facId)!.records.push(rec);
                }
                const facultyGroups = Array.from(groupsMap.values());

                if (facultyGroups.length === 0) {
                  return (
                    <div className="py-8 text-center text-slate-400 font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                      No faculty allocations found in this semester.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {facultyGroups.map((group) => {
                      const isExpanded = expandedFacultyIds.has(group.facultyId);
                      const isUnallocated = group.records.length === 1 && group.records[0].subjectCode === 'N/A';
                      const subjectsCount = isUnallocated ? 0 : group.records.length;

                      return (
                        <div
                          key={group.facultyId}
                          className={cn(
                            "rounded-xl border transition-all duration-200 overflow-hidden",
                            isExpanded 
                              ? "border-sgvu-navy shadow-md ring-1 ring-sgvu-navy/10" 
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/20 shadow-sm"
                          )}
                        >
                          {/* Faculty Header Card — div (not button) so Report download can stay a real Button */}
                          <div
                            role="button"
                            tabIndex={0}
                            className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors bg-white hover:bg-slate-50/20 cursor-pointer"
                            onClick={() => toggleFacultyExpansion(group.facultyId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleFacultyExpansion(group.facultyId);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-sgvu-navy/5 flex items-center justify-center font-bold text-sgvu-navy text-xs border border-sgvu-navy/10">
                                {group.facultyName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 hover:text-sgvu-navy transition-colors">{group.facultyName}</h4>
                                <p className="text-xs text-slate-500 font-medium">{departmentLabel}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1"
                                disabled={auditExporting || !group.records[0]?.facultyId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const fid = group.records.find((r) => r.facultyId)?.facultyId;
                                  if (fid) void exportAuditReport(fid);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                                Report
                              </Button>
                              <span className={cn(
                                "text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all",
                                subjectsCount > 0 
                                  ? "bg-blue-50 text-blue-700 border-blue-100" 
                                  : "bg-slate-50 text-slate-400 border-slate-200"
                              )}>
                                {subjectsCount} {subjectsCount === 1 ? 'Subject' : 'Subjects'}
                              </span>
                              <ChevronDown 
                                className={cn(
                                  "h-5 w-5 text-slate-400 transition-transform duration-200", 
                                  isExpanded && "transform rotate-180 text-sgvu-navy"
                                )} 
                              />
                            </div>
                          </div>

                          {/* Accordion Content */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-white p-4">
                              {isUnallocated ? (
                                <div className="py-4 text-center text-xs text-slate-400 font-medium">
                                  No course allocations found for this faculty member.
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-100">
                                  <table className="w-full border-collapse text-left text-sm">
                                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-100">
                                      <tr>
                                        <th className="px-4 py-2.5">Subject</th>
                                        <th className="px-4 py-2.5 text-center">PPTs</th>
                                        <th className="px-4 py-2.5 text-center">Attendance</th>
                                        <th className="px-4 py-2.5">Marks Components</th>
                                        <th className="px-4 py-2.5">Status</th>
                                        <th className="px-4 py-2.5 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {[...group.records].sort((a, b) => a.semester - b.semester).map((rec) => (
                                        <tr key={rec.id} className="hover:bg-slate-50/50">
                                          <td className="px-4 py-3 text-xs">
                                             <div className="flex items-center gap-1.5 mb-0.5">
                                               <span className="font-bold text-sgvu-navy">{rec.subjectCode}</span>
                                               <span className="bg-slate-100 text-slate-600 border border-slate-200/50 hover:bg-slate-100 font-semibold px-1 rounded-[4px] text-[9px] uppercase">
                                                 Sem {rec.semester}
                                               </span>
                                             </div>
                                             <p className="text-slate-500 font-medium">{rec.subjectName}</p>
                                           </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className="font-bold text-slate-700 block text-xs">{rec.pptsUploaded} / 50</span>
                                            <span className="text-[10px] text-muted-foreground block font-medium">Uploaded</span>
                                          </td>
                                          <td className="px-4 py-3">
                                            <div className="flex flex-col items-center justify-center text-center gap-1">
                                              <span className="font-bold text-slate-800 text-xs tabular-nums">
                                                {rec.classesConducted ?? 0} / {rec.totalClasses ?? '—'} classes
                                              </span>
                                              <span className="text-[10px] text-muted-foreground font-medium">
                                                {rec.attendanceMarked}% logged
                                              </span>
                                              {rec.attendanceStatusLabel === 'Missed Class' && (
                                                <button
                                                  className="text-[11px] text-rose-600 font-bold hover:underline"
                                                  onClick={() => setSelectedMissedAttendance(rec)}
                                                >
                                                  {rec.attendanceMissingClasses?.length || 0} missed today
                                                </button>
                                              )}
                                              {rec.attendanceStatusLabel === 'No Class Today' && (
                                                <span className="text-[10px] text-slate-400">No class today</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-[9px] font-bold">
                                              <span className={cn('px-1.5 py-0.5 rounded border', rec.marksUploaded.ga ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100')}>GA</span>
                                              <span className={cn('px-1.5 py-0.5 rounded border', rec.marksUploaded.wt ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100')}>WT</span>
                                              <span className={cn('px-1.5 py-0.5 rounded border', rec.marksUploaded.labs ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100')}>LAB</span>
                                              <span className={cn('px-1.5 py-0.5 rounded border', rec.marksUploaded.theory ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100')}>TH</span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3">
                                            {rec.marksStatus === 'OPEN' && (
                                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 font-semibold hover:bg-emerald-50">Open</Badge>
                                            )}
                                            {rec.marksStatus === 'LOCKED' && (
                                              <Badge className="bg-slate-50 text-slate-500 border border-slate-200 font-semibold hover:bg-slate-50">Locked</Badge>
                                            )}
                                            {rec.marksStatus === 'EDIT_REQUESTED' && (
                                              <Badge className="bg-amber-50 text-amber-700 border border-amber-200/50 font-semibold hover:bg-amber-50">Requested</Badge>
                                            )}
                                            {rec.marksStatus === 'N/A' && (
                                              <Badge className="bg-slate-100 text-slate-400 border border-slate-200/60 hover:bg-slate-100 font-semibold">N/A</Badge>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                            {rec.marksStatus === 'EDIT_REQUESTED' ? (
                                              <Button
                                                size="default"
                                                variant="outline"
                                                className="h-8 text-xs text-sgvu-navy border-slate-200 hover:bg-slate-50 font-semibold px-2 rounded-lg"
                                                onClick={() => {
                                                  setSelectedAuditRequest(rec);
                                                  setIsAuditSheetOpen(true);
                                                }}
                                              >
                                                Review Request
                                              </Button>
                                            ) : (
                                              <span className="text-xs text-slate-400 font-semibold">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Live biometrics card + resignations */}
            <div className="lg:col-span-4 space-y-6">
              <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-sgvu-navy" />
                  <h3 className="font-bold text-sgvu-navy">Live Attendance Feed</h3>
                </div>
                <div className="space-y-3">
                  {punches.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No biometric punches for today yet. Data syncs from HR attendance every few minutes.
                    </p>
                  ) : (
                  punches.map((p) => {
                    const hasPunchIn = !!p.punchIn;
                    const hasPunchOut = !!p.punchOut;
                    
                    return (
                      <div key={p.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 text-sm hover:border-slate-200 transition-all">
                        {/* Faculty Name & Status Badge */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="font-semibold text-slate-800">{p.facultyName}</p>
                          
                          {p.status === 'LEAVE' && (
                            <Badge className="bg-amber-50 text-amber-700 border border-amber-200/50 hover:bg-amber-50 font-bold text-[9px] py-0 px-1.5 uppercase">On Leave</Badge>
                          )}
                          {p.status === 'ABSENT' && (
                            <Badge className="bg-rose-50 text-rose-700 border border-rose-200/50 hover:bg-rose-50 font-bold text-[9px] py-0 px-1.5 uppercase">Absent</Badge>
                          )}
                          {p.status === 'HALF_DAY' && (
                            <Badge className="bg-orange-50 text-orange-700 border border-orange-200/50 hover:bg-orange-50 font-bold text-[9px] py-0 px-1.5 uppercase">Half Day</Badge>
                          )}
                          {p.status === 'PRESENT' && (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 hover:bg-emerald-50 font-bold text-[9px] py-0 px-1.5 uppercase">Present</Badge>
                          )}
                        </div>

                        {/* Punch Details */}
                        {hasPunchIn ? (
                          <div className="flex items-center justify-between text-xs border-t border-slate-100/80 pt-2 text-slate-500 font-medium">
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-bold">Punch In</span>
                              <span className="text-slate-700 font-semibold">{p.punchIn}</span>
                            </div>
                            
                            <div className="text-center bg-slate-100/80 px-2 py-0.5 rounded text-[10px] font-bold text-slate-700">
                              {p.totalHours}
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-bold">Punch Out</span>
                              <span className="text-slate-700 font-semibold">
                                {hasPunchOut ? p.punchOut : <span className="text-emerald-600 font-bold">Active</span>}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 font-medium border-t border-slate-100/80 pt-2 leading-relaxed">
                            No attendance logs registered for today.
                          </div>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>

              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-sgvu-navy" />
                  <h3 className="font-bold text-sgvu-navy">Subject Handover</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reassign active department subjects to another faculty member. Timetable and LMS access update
                  automatically.
                </p>
                {assignedCourses.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No assigned subjects found. Allocate courses from the Course Allocation Matrix first.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto">
                    {assignedCourses.slice(0, 12).map((course) => (
                      <li
                        key={course.allocation_id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-sgvu-navy truncate">
                            {course.subject_code} · {course.subject_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {course.faculty_name} · Sem {course.semester} · {course.academic_year}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-8 text-xs"
                          onClick={() => {
                            setHandoverCourse(course);
                            setHandoverTargetFacultyId('');
                          }}
                        >
                          Reassign
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Compiled Results Matrix */}
        <TabsContent value="results" className="space-y-6 outline-none">
          <HodCompiledResultsPanel />
        </TabsContent>

        {/* Tab 5: Placement Interview Attendance */}
        <TabsContent value="placement" className="space-y-6 outline-none">
          <HodPlacementPanel />
        </TabsContent>
      </Tabs>

      {/* Sheet for Marks Edit Request */}
      <Sheet open={isAuditSheetOpen} onOpenChange={setIsAuditSheetOpen}>
        <SheetContent className="sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-sgvu-navy flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-sgvu-gold" />
              Review Marks Unlock Request
            </SheetTitle>
            <SheetDescription>
              A faculty member is requesting temporary unlock access to update evaluation entries after the marks lock.
            </SheetDescription>
          </SheetHeader>
          {selectedAuditRequest && (
            <div className="py-6 space-y-6">
              <div className="space-y-4 rounded-xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex justify-between border-b border-slate-200/50 pb-2.5">
                  <span className="text-xs font-semibold text-slate-500">FACULTY MEMBER</span>
                  <span className="text-xs font-bold text-sgvu-navy">{selectedAuditRequest.facultyName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/50 pb-2.5">
                  <span className="text-xs font-semibold text-slate-500">SUBJECT ATTACHED</span>
                  <span className="text-xs font-bold text-sgvu-navy">{selectedAuditRequest.subjectCode} ({selectedAuditRequest.subjectName})</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 block">FACULTY JUSTIFICATION</span>
                  <p className="text-sm font-semibold text-slate-700 bg-white p-3 rounded-lg border border-slate-100/80 leading-relaxed italic">
                    &ldquo;{selectedAuditRequest.editRequestReason}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  size="default"
                  variant="outline"
                  className="h-10 text-sm font-semibold text-red-600 border-slate-200 hover:bg-red-50"
                  onClick={async () => {
                    try {
                      const courseId = selectedAuditRequest.id.substring(selectedAuditRequest.id.length - 36);
                      await api.post('/api/academics/hod/faculty-audit/unlock-action', {
                        course_id: courseId,
                        action: 'REJECT',
                      });
                      toast.success(`Marks unlock request from ${selectedAuditRequest.facultyName} has been rejected.`);
                      setIsAuditSheetOpen(false);
                      load(true);
                    } catch (e) {
                      toast.error('Failed to reject unlock request');
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                  Reject Request
                </Button>
                <Button
                  size="default"
                  className="h-10 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  onClick={async () => {
                    try {
                      const courseId = selectedAuditRequest.id.substring(selectedAuditRequest.id.length - 36);
                      await api.post('/api/academics/hod/faculty-audit/unlock-action', {
                        course_id: courseId,
                        action: 'APPROVE',
                      });
                      toast.success(`Marks editing unlocked successfully for ${selectedAuditRequest.facultyName}.`);
                      setIsAuditSheetOpen(false);
                      load(true);
                    } catch (e) {
                      toast.error('Failed to approve unlock request');
                    }
                  }}
                >
                  <Check className="h-4 w-4" />
                  Approve Unlock
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog for Subject Handover / Reallocation */}
      <Dialog open={!!handoverCourse} onOpenChange={(open) => { if (!open) setHandoverCourse(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-sgvu-navy flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-sgvu-gold" />
              Initiate Subject Handover
            </DialogTitle>
            <DialogDescription>
              Reassign syllabus, student roster, and evaluation access to another faculty member in your department.
            </DialogDescription>
          </DialogHeader>
          {handoverCourse && (
            <div className="py-4 space-y-4">
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-500">SUBJECT</span>
                  <span className="text-xs font-bold text-sgvu-navy text-right">
                    {handoverCourse.subject_code} — {handoverCourse.subject_name}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-500">CURRENT TEACHER</span>
                  <span className="text-xs font-bold text-red-600 text-right">{handoverCourse.faculty_name}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sgvu-navy">Select new faculty</label>
                <Select value={handoverTargetFacultyId} onValueChange={setHandoverTargetFacultyId}>
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select target faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {handoverFaculty
                      .filter((f) => f.user_id !== handoverCourse.faculty_user_id)
                      .map((f) => (
                        <SelectItem key={f.user_id} value={f.user_id}>
                          {f.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-4 gap-2">
                <Button
                  size="default"
                  variant="outline"
                  className="h-10 text-sm font-semibold border-slate-200"
                  disabled={handoverSaving}
                  onClick={() => setHandoverCourse(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="default"
                  className="h-10 text-sm font-semibold bg-sgvu-navy hover:bg-sgvu-navy/90 text-white gap-1.5"
                  disabled={!handoverTargetFacultyId || handoverSaving}
                  onClick={() => {
                    if (!handoverTargetFacultyId) return;
                    const targetFac = handoverFaculty.find((f) => f.user_id === handoverTargetFacultyId);
                    setHandoverSaving(true);
                    void api
                      .patch(
                        `/api/academics/hod/teaching-load/${handoverCourse.allocation_id}/reassign`,
                        { faculty_user_id: handoverTargetFacultyId },
                      )
                      .then(() => {
                        toast.success(
                          `${handoverCourse.subject_code} reassigned to ${targetFac?.name ?? 'faculty'}`,
                        );
                        setHandoverCourse(null);
                        setHandoverTargetFacultyId('');
                        void load(true);
                      })
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : 'Handover failed'),
                      )
                      .finally(() => setHandoverSaving(false));
                  }}
                >
                  {handoverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirm reassignment
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog for Biometrics Attendance dispute HR deduction approval */}
      <Dialog open={isDisputeDialogOpen} onOpenChange={setIsDisputeDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Dispute Attendance & Deduct Salary
            </DialogTitle>
            <DialogDescription>
              Confirming this will file a formal attendance cut recommendation to the HR biometric portal. The salary component of this shift will be marked as disputed pending revision.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-2">
            <Button
              size="default"
              variant="outline"
              className="h-10 text-sm font-semibold border-slate-200"
              onClick={() => setIsDisputeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="default"
              className="h-10 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (disputePunchId) {
                  setPunches(
                    punches.map((p) => p.id === disputePunchId ? { ...p, disputed: true } : p)
                  );
                }
                setIsDisputeDialogOpen(false);
                toast.success('Dispute cut registered. Salary deduction request successfully forwarded to HR.');
              }}
            >
              Confirm HR Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for Missing Attendance Registry Details */}
      <Dialog open={!!selectedMissedAttendance} onOpenChange={(open) => { if (!open) setSelectedMissedAttendance(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          {selectedMissedAttendance && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-sgvu-navy flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                  Missing Attendance Registry
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium">
                  {selectedMissedAttendance.facultyName} has pending student attendance logs for the following scheduled slots:
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5 max-h-[250px] overflow-y-auto">
                {selectedMissedAttendance.attendanceMissingClasses?.map((cls, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-white p-3 shadow-xs">
                    <div>
                      <span className="text-xs font-bold text-sgvu-navy block">{cls.split(' at ')[0]}</span>
                      <span className="text-[11px] font-semibold text-slate-500 block">
                        {cls.split(' at ')[1] || 'Scheduled Class'}
                      </span>
                    </div>
                    <Badge className="bg-rose-50 text-rose-700 border border-rose-100 font-bold text-[10px] py-0 px-2">
                      Pending Mark
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="bg-slate-100/60 p-3 rounded-lg border border-slate-200/40 text-[11px] text-muted-foreground flex gap-2">
                <span className="font-semibold text-rose-600 shrink-0">Note:</span>
                <span>As per university policy, daily attendance logs must be completed within 24 hours of class completion to avoid compliance flags.</span>
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button
                  size="default"
                  variant="outline"
                  className="h-10 text-sm font-semibold border-slate-200"
                  onClick={() => setSelectedMissedAttendance(null)}
                >
                  Close
                </Button>
                <Button
                  size="default"
                  className="h-10 text-sm font-semibold bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                  disabled={sendingAttendanceAlert}
                  onClick={() => {
                    if (!selectedMissedAttendance) return;
                    setSendingAttendanceAlert(true);
                    void api
                      .post('/api/academics/hod/faculty-audit/attendance-reminder', {
                        faculty_user_id: selectedMissedAttendance.facultyId,
                        subject_code: selectedMissedAttendance.subjectCode,
                        missing_classes: selectedMissedAttendance.attendanceMissingClasses ?? [],
                      })
                      .then(() => {
                        toast.success(`Notification sent to ${selectedMissedAttendance.facultyName}`);
                        setSelectedMissedAttendance(null);
                      })
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : 'Failed to send alert'),
                      )
                      .finally(() => setSendingAttendanceAlert(false));
                  }}
                >
                  {sendingAttendanceAlert ? 'Sending…' : 'Send Alert Notification'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stat Card Drill-down Dialog */}
      <Dialog open={!!drillDownType} onOpenChange={(open) => { if (!open) setDrillDownType(null); }}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-sgvu-navy flex items-center gap-2">
              {drillDownType === 'faculty' && <Users className="h-5 w-5 text-sgvu-gold" />}
              {drillDownType === 'classes' && <CalendarClock className="h-5 w-5 text-sgvu-gold" />}
              {drillDownType === 'attendance' && <GraduationCap className="h-5 w-5 text-sgvu-gold" />}
              {drillDownType === 'inbox' && <Inbox className="h-5 w-5 text-sgvu-gold" />}
              {drillDownType === 'redflags' && <AlertTriangle className="h-5 w-5 text-sgvu-gold" />}
              {drillDownType === 'syllabus' && <ClipboardList className="h-5 w-5 text-sgvu-gold" />}
              {drillDownType === 'faculty' && 'Faculty Registry Members'}
              {drillDownType === 'classes' && 'Scheduled Classes Today'}
              {drillDownType === 'attendance' && 'Department Attendance Overview'}
              {drillDownType === 'inbox' && 'Pending Approvals Sign-off Inbox'}
              {drillDownType === 'redflags' && 'Attendance Defaulters (Below 75%)'}
              {drillDownType === 'syllabus' && 'Courses Behind Syllabus Schedule'}
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of the metric counts active in the department.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {drillDownType === 'faculty' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                {realFaculty.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">No faculty roster data loaded.</p>
                ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Faculty Name</th>
                      <th className="px-4 py-3">Designation</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {(realFaculty.length > 0
                      ? realFaculty.map((f) => ({
                          id: f.user_id,
                          name: f.name,
                          desig: f.role || 'Faculty',
                          dept: f.department || '—',
                          email: f.email,
                          status: 'Active',
                        }))
                      : []
                    ).map((f, i) => (
                      <tr key={f.id || i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sgvu-navy font-bold">{f.name}</td>
                        <td className="px-4 py-3 text-slate-600">{f.desig}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>{f.dept}</p>
                          {f.email && <p className="text-[11px] text-slate-400 font-medium">{f.email}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={f.status.includes('Active') ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50' : 'bg-amber-50 text-amber-700 hover:bg-amber-50'}>{f.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {drillDownType === 'classes' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                {todayClasses.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">
                    No classes scheduled for today in the department timetable.
                  </p>
                ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Faculty</th>
                      <th className="px-4 py-3">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {todayClasses.map((c) => (
                      <tr key={c.timetable_id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {formatTimetableTime(c.start_time)} – {formatTimetableTime(c.end_time)}
                        </td>
                        <td className="px-4 py-3 text-sgvu-navy font-bold">{c.course_code}</td>
                        <td className="px-4 py-3 text-slate-600">{c.faculty_name}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-slate-100 text-slate-700">{c.room || 'TBD'}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {drillDownType === 'attendance' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                {auditRecords.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">
                    No faculty audit data available yet.
                  </p>
                ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Faculty</th>
                      <th className="px-4 py-3 text-right">Attendance logged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {auditRecords
                      .filter((rec) => rec.subjectCode !== 'N/A')
                      .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-bold text-sgvu-navy">{item.subjectCode}</p>
                          <p className="text-xs text-slate-500">{item.subjectName}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.facultyName}</td>
                        <td className="px-4 py-3 text-right text-lg font-bold text-sgvu-navy">
                          {item.attendanceMarked}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {drillDownType === 'inbox' && (
              <div className="space-y-3">
                {data.pending_inbox.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No pending approvals right now.</p>
                ) : (
                  data.pending_inbox.map((row) => (
                    <div key={row.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50 text-sm">
                      <span className="mt-1 h-auto w-1 shrink-0 self-stretch rounded-full bg-sgvu-gold" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-sgvu-navy">{row.employee_name}</p>
                          <Badge className="bg-slate-100 text-slate-600 text-xs font-semibold">{row.title}</Badge>
                        </div>
                        <p className="text-slate-600 text-xs mt-0.5">{row.detail}</p>
                        <p className="text-slate-400 text-[11px] mt-1">{row.date_label}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          className="h-8 bg-sgvu-navy hover:bg-sgvu-navy/90"
                          disabled={actingId === row.id}
                          onClick={() => void actOnInbox(row, 'APPROVE')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={actingId === row.id}
                          onClick={() => void actOnInbox(row, 'REJECT')}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <div className="pt-2 text-center">
                  <Link
                    href="/hod/reporting-directory?tab=dashboard&scope=dept"
                    className="text-xs font-bold text-sgvu-navy underline underline-offset-2"
                  >
                    Open full Team Requests in Zimyo →
                  </Link>
                </div>
              </div>
            )}

            {drillDownType === 'redflags' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3 text-right">Avg Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {data.attendance_deficits.map((row) => (
                      <tr key={row.user_id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-sgvu-navy">{row.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-semibold">{row.email}</td>
                        <td className="px-4 py-3 text-right text-lg font-black text-red-600">{row.average_attendance}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {drillDownType === 'syllabus' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Allocated Faculty</th>
                      <th className="px-4 py-3 text-right">Current Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {behindSyllabus.map((row) => (
                      <tr key={row.course_code} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-sgvu-navy">{row.course_code}</td>
                        <td className="px-4 py-3 text-slate-600">{row.faculty_name}</td>
                        <td className="px-4 py-3 text-right font-black text-amber-600">{row.coverage_percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              size="default"
              className="bg-sgvu-navy hover:bg-sgvu-navy/90 text-white font-semibold"
              onClick={() => setDrillDownType(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HodPageFrame>
  );
}
