'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrAvatar } from '@/components/hr/HrAvatar';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { FalconLoader } from '@/components/brand/FalconLoader';
import {
  HodActionButton,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
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

// Custom Module Types & Initial Mock Datasets
interface HODCourse {
  id: string;
  code: string;
  name: string;
  semester: number;
  credits: number;
  facultyId: string | null;
}

interface AuditRecord {
  id: string;
  facultyName: string;
  facultyId?: string;
  semester: number;
  subjectCode: string;
  subjectName: string;
  pptsUploaded: number;
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

interface PlacementCompany {
  id: string;
  name: string;
  date: string;
  position: string;
  semester: number;
}

interface PlacementStudentAttendance {
  studentId: string;
  studentName: string;
  semester: number;
  companyAttendance: { [companyId: string]: 'APPEARED' | 'ABSENT' | 'PENDING' };
}

interface FacultyRosterItem {
  user_id: string;
  name: string;
  email: string;
  department: string | null;
  role: string | null;
}

interface StudentResultRow {
  studentId: string;
  name: string;
  wt1: number;
  wt2: number;
  mt1: number;
  mt2: number;
  project: number;
  lab: number;
  endTheory: number;
  endPractical: number;
}

interface LivePunchRecord {
  id: string;
  facultyName: string;
  punchIn: string | null;
  punchOut: string | null;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY';
  totalHours?: string;
}

interface ResigningFaculty {
  id: string;
  name: string;
  department: string;
  resignationDate: string;
  clearanceStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const INITIAL_COURSES: HODCourse[] = [
  { id: 'c-1', code: 'CSE301', name: 'Database Management Systems', semester: 5, credits: 4, facultyId: 'f-1' },
  { id: 'c-2', code: 'CSE302', name: 'Computer Networks', semester: 5, credits: 4, facultyId: 'f-2' },
  { id: 'c-3', code: 'CSE303', name: 'Software Engineering', semester: 5, credits: 3, facultyId: null },
  { id: 'c-4', code: 'CSE101', name: 'Engineering Mathematics I', semester: 1, credits: 4, facultyId: 'f-1' },
  { id: 'c-5', code: 'CSE102', name: 'Programming in C', semester: 1, credits: 3, facultyId: 'f-3' },
];

const INITIAL_PUNCHES: LivePunchRecord[] = [
  { id: 'p-1', facultyName: 'Prof. Sachin', punchIn: '08:58 AM', punchOut: null, status: 'PRESENT', totalHours: 'Active' },
  { id: 'p-2', facultyName: 'Prof. Sharma', punchIn: '09:05 AM', punchOut: '01:30 PM', status: 'HALF_DAY', totalHours: '4h 25m' },
  { id: 'p-3', facultyName: 'Prof. Verma', punchIn: '09:12 AM', punchOut: '05:02 PM', status: 'PRESENT', totalHours: '7h 50m' },
];

const INITIAL_AUDITS: AuditRecord[] = [
  {
    id: 'a-1',
    facultyName: 'Prof. Sachin',
    facultyId: 'f-1',
    semester: 3,
    subjectCode: 'CSE301',
    subjectName: 'Database Management Systems',
    pptsUploaded: 14,
    attendanceMarked: 92,
    attendanceMissingClasses: [],
    attendanceStatusLabel: 'All Marked',
    marksUploaded: { ga: true, wt: true, labs: true, theory: true },
    marksStatus: 'LOCKED',
  },
  {
    id: 'a-2',
    facultyName: 'Prof. Sharma',
    facultyId: 'f-2',
    semester: 3,
    subjectCode: 'CSE302',
    subjectName: 'Computer Networks',
    pptsUploaded: 12,
    attendanceMarked: 89,
    attendanceMissingClasses: [
      'CSE302 at 11:00 AM (Today)',
      'CSE302 at 11:00 AM (Monday, 29th June)'
    ],
    attendanceStatusLabel: 'Missed Class',
    marksUploaded: { ga: true, wt: true, labs: false, theory: false },
    marksStatus: 'OPEN',
  },
  {
    id: 'a-3',
    facultyName: 'Prof. Verma',
    facultyId: 'f-3',
    semester: 5,
    subjectCode: 'CSE305',
    subjectName: 'Software Engineering',
    pptsUploaded: 8,
    attendanceMarked: 85,
    attendanceMissingClasses: [
      'CSE305 at 02:00 PM (Yesterday)',
      'CSE305 at 02:00 PM (Friday, 26th June)',
      'CSE306 at 10:00 AM (Monday, 29th June)'
    ],
    attendanceStatusLabel: 'Missed Class',
    marksUploaded: { ga: true, wt: true, labs: true, theory: true },
    marksStatus: 'EDIT_REQUESTED',
    editRequestReason: 'I made a typo in the end-semester lab evaluation marks for Rohit Bala. Requesting unlock to update the record.',
  },
];

const INITIAL_STUDENTS: StudentResultRow[] = [
  { studentId: 's-1', name: 'Amit Kumar', wt1: 18, wt2: 19, mt1: 23, mt2: 24, project: 45, lab: 42, endTheory: 52, endPractical: 46 },
  { studentId: 's-2', name: 'Neha Singh', wt1: 15, wt2: 16, mt1: 20, mt2: 22, project: 40, lab: 38, endTheory: 45, endPractical: 40 },
  { studentId: 's-3', name: 'Rohan Sharma', wt1: 12, wt2: 14, mt1: 18, mt2: 19, project: 35, lab: 32, endTheory: 38, endPractical: 35 },
  { studentId: 's-4', name: 'Priya Verma', wt1: 19, wt2: 20, mt1: 24, mt2: 25, project: 48, lab: 45, endTheory: 56, endPractical: 48 },
];


const INITIAL_RESIGNATIONS: ResigningFaculty[] = [
  { id: 'r-1', name: 'Prof. Gupta', department: 'Computer Science', resignationDate: '2026-06-15', clearanceStatus: 'PENDING' },
];

const INITIAL_PLACEMENT_COMPANIES: PlacementCompany[] = [
  { id: 'pc-1', name: 'Google', date: '2026-06-15', position: 'Software Engineer', semester: 7 },
  { id: 'pc-2', name: 'TCS', date: '2026-06-18', position: 'System Engineer', semester: 7 },
  { id: 'pc-3', name: 'Infosys', date: '2026-06-20', position: 'Developer', semester: 7 },
  { id: 'pc-4', name: 'Microsoft', date: '2026-06-22', position: 'Cloud Consultant', semester: 7 },
  { id: 'pc-5', name: 'Wipro', date: '2026-06-25', position: 'Web Developer', semester: 5 },
  { id: 'pc-6', name: 'Cognizant', date: '2026-06-28', position: 'Graduate Analyst', semester: 5 },
];

const INITIAL_PLACEMENT_ATTENDANCE: PlacementStudentAttendance[] = [
  {
    studentId: 's-1',
    studentName: 'Amit Kumar',
    semester: 7,
    companyAttendance: { 'pc-1': 'APPEARED', 'pc-2': 'ABSENT', 'pc-3': 'APPEARED', 'pc-4': 'ABSENT' },
  },
  {
    studentId: 's-2',
    studentName: 'Neha Singh',
    semester: 7,
    companyAttendance: { 'pc-1': 'ABSENT', 'pc-2': 'APPEARED', 'pc-3': 'APPEARED', 'pc-4': 'APPEARED' },
  },
  {
    studentId: 's-3',
    studentName: 'Rohan Sharma',
    semester: 7,
    companyAttendance: { 'pc-1': 'ABSENT', 'pc-2': 'ABSENT', 'pc-3': 'APPEARED', 'pc-4': 'APPEARED' },
  },
  {
    studentId: 's-4',
    studentName: 'Priya Verma',
    semester: 7,
    companyAttendance: { 'pc-1': 'APPEARED', 'pc-2': 'APPEARED', 'pc-3': 'APPEARED', 'pc-4': 'APPEARED' },
  },
  {
    studentId: 's-5',
    studentName: 'Suresh Kumar',
    semester: 5,
    companyAttendance: { 'pc-5': 'APPEARED', 'pc-6': 'ABSENT' },
  },
  {
    studentId: 's-6',
    studentName: 'Anjali Sharma',
    semester: 5,
    companyAttendance: { 'pc-5': 'ABSENT', 'pc-6': 'APPEARED' },
  },
];

export function HodCommandCenter() {
  const api = useAuthedApi();
  const istNow = useIstClock();
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [unassignedLoad, setUnassignedLoad] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Operational Pillars States
  const [coursesList, setCoursesList] = useState<HODCourse[]>(INITIAL_COURSES);

  const [handoverCourse, setHandoverCourse] = useState<HODCourse | null>(null);
  const [handoverTargetFacultyId, setHandoverTargetFacultyId] = useState('');

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>(INITIAL_AUDITS);
  const [selectedAuditRequest, setSelectedAuditRequest] = useState<AuditRecord | null>(null);
  const [isAuditSheetOpen, setIsAuditSheetOpen] = useState(false);
  const [selectedMissedAttendance, setSelectedMissedAttendance] = useState<AuditRecord | null>(null);
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

  const [punches, setPunches] = useState<LivePunchRecord[]>(INITIAL_PUNCHES);
  const [disputePunchId, setDisputePunchId] = useState<string | null>(null);
  const [isDisputeDialogOpen, setIsDisputeDialogOpen] = useState(false);

  const [resignations, setResignations] = useState<ResigningFaculty[]>(INITIAL_RESIGNATIONS);
  const [resultsSemester, setResultsSemester] = useState('5');
  const [resultsRows] = useState<StudentResultRow[]>(INITIAL_STUDENTS);
  const [drillDownType, setDrillDownType] = useState<'faculty' | 'classes' | 'attendance' | 'inbox' | 'redflags' | 'syllabus' | null>(null);

  // Placement Attendance States
  const [placementCompanies, setPlacementCompanies] = useState<PlacementCompany[]>(INITIAL_PLACEMENT_COMPANIES);
  const [placementAttendance] = useState<PlacementStudentAttendance[]>(INITIAL_PLACEMENT_ATTENDANCE);
  const [newPlCompanyName, setNewPlCompanyName] = useState('');
  const [newPlPosition, setNewPlPosition] = useState('');
  const [newPlDate, setNewPlDate] = useState('2026-06-30');
  const [newPlSemester, setNewPlSemester] = useState('7');
  const [selectedPlacementReport, setSelectedPlacementReport] = useState<PlacementStudentAttendance | null>(null);
  const [realFaculty, setRealFaculty] = useState<FacultyRosterItem[]>([]);

  // Derived Faculty Members for Select List
  const facultyList = useMemo(() => {
    if (realFaculty && realFaculty.length > 0) {
      return [
        ...realFaculty.map((f) => ({ id: f.user_id, name: f.name })),
        { id: 'new_hire', name: 'New Hire Placeholder' }
      ];
    }
    return [
      { id: 'f-1', name: 'Prof. Sachin' },
      { id: 'f-2', name: 'Prof. Sharma' },
      { id: 'f-3', name: 'Prof. Verma' },
      { id: 'f-4', name: 'Prof. Gupta' },
      { id: 'new_hire', name: 'New Hire Placeholder' }
    ];
  }, [realFaculty]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [payload, unassigned, roster, audits] = await Promise.all([
          api.get<CommandCenterPayload>('/api/academics/hod/command-center'),
          api.get<{ count: number }>('/api/academics/hod/teaching-load/unassigned/count').catch(() => ({ count: 0 })),
          api.get<FacultyRosterItem[]>('/api/academics/hod/faculty-roster').catch(() => []),
          api.get<AuditRecord[]>('/api/academics/hod/faculty-audit').catch(() => []),
        ]);
        setData(payload);
        setUnassignedLoad(unassigned.count);
        setRealFaculty(roster);
        if (audits && audits.length > 0) {
          setAuditRecords(audits);
        } else {
          setAuditRecords([]);
        }
        setPunches([]);
        setResignations([]);
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
        description="Academic health, faculty operations, and pending approvals for your department."
        meta={
          <>
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
          <>
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
            <HodActionButton href="/hod/academics/course-allocation">Allocate Courses</HodActionButton>
          </>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
        <HrStatCard
          label="Pending Inbox"
          value={m.pending_inbox_total}
          sub={`${m.pending_leave_count} leaves · ${m.pending_gate_pass_count} gate passes`}
          icon={Inbox}
          accent="gold"
          alert={m.pending_inbox_total > 0}
          onClick={() => setDrillDownType('inbox')}
        />
        <HrStatCard
          label="Red Flags"
          value={data.attendance_deficits.length}
          sub="Students below 75%"
          icon={AlertTriangle}
          alert={data.attendance_deficits.length > 0}
          onClick={() => setDrillDownType('redflags')}
        />
        <HrStatCard
          label="Syllabus Risk"
          value={behindSyllabus.length}
          sub={behindSyllabus.length ? 'Courses behind schedule' : 'LMS on track'}
          icon={ClipboardList}
          alert={behindSyllabus.length > 0}
          onClick={() => setDrillDownType('syllabus')}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { href: '/hod/department-timetable', label: 'Timetable' },
          { href: '/hod/faculty/workload', label: 'Workload' },
          { href: '/hod/academics/syllabus-tracking', label: 'Syllabus' },
          { href: '/hod/academics/result-analytics', label: 'Results' },
          { href: '/hod/inbox?scope=dept', label: 'HR Inbox' },
          { href: '/hod/students/defaulters', label: 'Defaulters' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-sgvu-navy shadow-sm transition-colors hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <Tabs defaultValue="overview" className="w-full mt-6 space-y-6">
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
              href="/hod/academics/syllabus-tracking"
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
              href="/hod/inbox?scope=dept"
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
              href="/hod/students/defaulters"
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-5 py-4 mt-4 shadow-sm">
            <p className="text-sm text-sgvu-navy">
              <span className="font-bold text-sgvu-navy">{m.pending_profile_corrections > 0 ? m.pending_profile_corrections : 23}</span> profile corrections pending review
            </p>
            <Link href="/hod/approvals/profile-corrections">
              <Button size="default" variant="outline" className="h-9 border-slate-200 bg-white text-sm text-slate-800 hover:bg-slate-50 font-semibold px-4 rounded-xl">
                Review profiles
              </Button>
            </Link>
          </div>

          <TodayBirthdaysWidget className="mt-4 shadow-sm" />
        </TabsContent>



        <TabsContent value="audit" className="space-y-6 outline-none">
          <SampleDataBanner message="Faculty audit rows load from LMS allocations when faculty-audit API returns data. Empty state means no syllabus allocations synced yet — not a system error." />
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Faculty progress audit section */}
            <div className="lg:col-span-8 rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-sgvu-navy">Faculty Progress & Marks Audit</h3>
                  <p className="text-sm text-muted-foreground">Monitor syllabus, PPT uploads, and grade lock statuses under the 7-day rule.</p>
                </div>
                
                {/* Semester Choice Dropdown Selector */}
                <div className="flex items-center gap-2">
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
                          {/* Faculty Header Card */}
                          <button
                            className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors bg-white hover:bg-slate-50/20"
                            onClick={() => toggleFacultyExpansion(group.facultyId)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-sgvu-navy/5 flex items-center justify-center font-bold text-sgvu-navy text-xs border border-sgvu-navy/10">
                                {group.facultyName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 hover:text-sgvu-navy transition-colors">{group.facultyName}</h4>
                                <p className="text-xs text-slate-500 font-medium">Department of Computer Science</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
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
                          </button>

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
                                            <div className="flex flex-col items-center justify-center text-center">
                                              {rec.attendanceStatusLabel === 'No Class Today' && (
                                                <>
                                                  <Badge className="bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-100 font-bold text-[10px] py-0.5 px-1.5">No Class Today</Badge>
                                                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Not Scheduled</span>
                                                </>
                                              )}
                                              {rec.attendanceStatusLabel === 'Upcoming Class' && (
                                                <>
                                                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200/50 hover:bg-blue-50 font-bold text-[10px] py-0.5 px-1.5">Upcoming</Badge>
                                                  <span className="text-[10px] text-blue-500 font-semibold block mt-0.5">Scheduled Later</span>
                                                </>
                                              )}
                                              {rec.attendanceStatusLabel === 'N/A' && (
                                                <>
                                                  <Badge className="bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-100 font-bold text-[10px] py-0.5 px-1.5">N/A</Badge>
                                                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">No Subject</span>
                                                </>
                                              )}
                                              {rec.attendanceStatusLabel === 'All Marked' && (
                                                <>
                                                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 hover:bg-emerald-50 font-bold text-[10px] py-0.5 px-1.5">All Marked</Badge>
                                                  <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">On Schedule</span>
                                                </>
                                              )}
                                              {rec.attendanceStatusLabel === 'Missed Class' && (
                                                <>
                                                  <Badge className="bg-rose-50 text-rose-700 border border-rose-200/50 hover:bg-rose-50 font-bold text-[10px] py-0.5 px-1.5">
                                                    {rec.attendanceMissingClasses?.length || 0} Missed
                                                  </Badge>
                                                  <button
                                                    className="text-[11px] text-rose-600 font-bold hover:underline block mt-0.5"
                                                    onClick={() => setSelectedMissedAttendance(rec)}
                                                  >
                                                    View Details
                                                  </button>
                                                </>
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
                                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 font-semibold hover:bg-emerald-50">Open (&lt;7d)</Badge>
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
                  {punches.map((p) => {
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
                  })}
                </div>

              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Compiled Results Matrix */}
        <TabsContent value="results" className="space-y-6 outline-none">
          <SampleDataBanner message="Sample compiled results matrix for UI preview. Use Result Analytics for live pass/fail data from enrollments." />
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-sgvu-navy">Compiled End-Semester Result Matrix</h3>
                <p className="text-sm text-muted-foreground">Comprehensive academic grade report aggregates continuous assessments and end-semester reviews.</p>
              </div>
              <div className="flex items-center gap-3">
                <Select value={resultsSemester} onValueChange={setResultsSemester}>
                  <SelectTrigger className="w-[180px] bg-white border-slate-200">
                    <SelectValue placeholder="Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                      <SelectItem key={sem} value={sem.toString()}>
                        Semester {sem}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="default"
                  variant="outline"
                  className="h-10 text-sm font-semibold border-slate-200 text-sgvu-navy hover:bg-slate-50 rounded-lg gap-2"
                  onClick={() => {
                    toast.success(`Exporting results spreadsheet for Semester ${resultsSemester}...`);
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Export to Excel
                </Button>
              </div>
            </div>

            {/* Warning Banner for Missing Uploads */}
            {resultsSemester === '5' ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 text-sm">Incomplete Marks Uploads</h4>
                  <p className="text-xs text-amber-700/90 mt-0.5">
                    Warning: <strong>Prof. Verma</strong> has NOT uploaded MT-2 and Lab marks for CSE305 (Software Engineering) for Semester {resultsSemester}. Grade locking deadline is approaching.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-800 text-sm">All Marks Synced</h4>
                  <p className="text-xs text-emerald-700/90 mt-0.5">
                    Success: All courses marks uploads are locked and complete for Semester {resultsSemester}.
                  </p>
                </div>
              </div>
            )}

            {/* Matrix Data Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Student ID</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3 text-center">WT-1 (20)</th>
                    <th className="px-4 py-3 text-center">WT-2 (20)</th>
                    <th className="px-4 py-3 text-center">MT-1 (25)</th>
                    <th className="px-4 py-3 text-center">MT-2 (25)</th>
                    <th className="px-4 py-3 text-center">Project (50)</th>
                    <th className="px-4 py-3 text-center">Lab (50)</th>
                    <th className="px-4 py-3 text-center">End Theory (60)</th>
                    <th className="px-4 py-3 text-center">End Practical (40)</th>
                    <th className="px-4 py-3 text-center">Total (100)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-medium">
                  {resultsRows.map((row) => {
                    const calculatedTotal = Math.round(
                      (row.wt1 + row.wt2 + row.mt1 + row.mt2) * 0.2 +
                      row.project * 0.1 +
                      row.lab * 0.1 +
                      row.endTheory * 0.4 +
                      row.endPractical * 0.2
                    );
                    return (
                      <tr key={row.studentId} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-600 text-xs">{row.studentId}</td>
                        <td className="px-4 py-3 font-bold text-sgvu-navy">{row.name}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.wt1}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.wt2}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.mt1}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.mt2}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.project}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.lab}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.endTheory}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{row.endPractical}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2.5 py-1 text-sm font-bold bg-slate-100 text-sgvu-navy rounded-md">
                            {calculatedTotal}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 5: Placement Interview Attendance */}
        <TabsContent value="placement" className="space-y-6 outline-none">
          <SampleDataBanner message="Sample placement attendance tracker for UI preview. Live placement data will connect to the placement cell module." />
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-sgvu-navy">Placement Interview Attendance Tracker</h3>
                <p className="text-sm text-muted-foreground">Pre-populate placement drive details, dispatch confirmation forms to 3rd & 4th year eligible students, and track appearance records.</p>
              </div>
            </div>

            {/* Form to Dispatch Attendance Form */}
            <div className="grid gap-4 md:grid-cols-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-200/60">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sgvu-navy">Company Name</label>
                <Input
                  value={newPlCompanyName}
                  onChange={(e) => setNewPlCompanyName(e.target.value)}
                  placeholder="e.g. Google / TCS"
                  className="bg-white border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sgvu-navy">Job Position</label>
                <Input
                  value={newPlPosition}
                  onChange={(e) => setNewPlPosition(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className="bg-white border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sgvu-navy">Interview Date</label>
                <Input
                  type="date"
                  value={newPlDate}
                  onChange={(e) => setNewPlDate(e.target.value)}
                  className="bg-white border-slate-200"
                />
              </div>
              <div className="flex gap-2">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-semibold text-sgvu-navy">Eligible Batch (Sem)</label>
                  <Select value={newPlSemester} onValueChange={setNewPlSemester}>
                    <SelectTrigger className="bg-white border-slate-200">
                      <SelectValue placeholder="Semester" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Sem 5 (3rd Year)</SelectItem>
                      <SelectItem value="7">Sem 7 (4th Year)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90 flex items-center gap-1.5 rounded-lg px-4 h-10"
                  onClick={() => {
                    if (!newPlCompanyName || !newPlPosition || !newPlDate) {
                      toast.error('All form fields must be completed to dispatch drives.');
                      return;
                    }
                    const newCompany: PlacementCompany = {
                      id: `pc-${Date.now()}`,
                      name: newPlCompanyName.trim(),
                      date: newPlDate,
                      position: newPlPosition.trim(),
                      semester: parseInt(newPlSemester, 10),
                    };
                    setPlacementCompanies([...placementCompanies, newCompany]);
                    setNewPlCompanyName('');
                    setNewPlPosition('');
                    toast.success(`Verification Form dispatched to Semester ${newPlSemester} eligible students for ${newCompany.name}!`);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Dispatch Form
                </Button>
              </div>
            </div>

            {/* Placement Attendance Matrix Logs */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Student Name</th>
                    <th className="px-6 py-4">Semester</th>
                    {placementCompanies.map((c) => (
                      <th key={c.id} className="px-6 py-4 text-center">
                        <span className="block font-bold text-sgvu-navy">{c.name}</span>
                        <span className="block text-[9px] text-slate-500 font-medium normal-case">{c.date}</span>
                      </th>
                    ))}
                    <th className="px-6 py-4 text-right">Proof Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {placementAttendance.map((att) => (
                    <tr key={att.studentId} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-bold text-slate-800">{att.studentName}</td>
                      <td className="px-6 py-4 text-slate-600">Sem {att.semester}</td>
                      {placementCompanies.map((c) => {
                        const status = att.companyAttendance[c.id];
                        if (c.semester !== att.semester) {
                          return (
                            <td key={c.id} className="px-6 py-4 text-center text-xs text-slate-300 font-medium">
                              N/A (Ineligible)
                            </td>
                          );
                        }
                        return (
                          <td key={c.id} className="px-6 py-4 text-center">
                            {status === 'APPEARED' && (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 hover:bg-emerald-50 font-bold">Appeared</Badge>
                            )}
                            {status === 'ABSENT' && (
                              <Badge className="bg-red-50 text-red-700 border border-red-200/50 hover:bg-red-50 font-bold">Absent / Skipped</Badge>
                            )}
                            {(!status || status === 'PENDING') && (
                              <Badge className="bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-50 font-semibold">Pending Verify</Badge>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="default"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs text-sgvu-navy border-slate-200 hover:bg-slate-50 font-bold rounded-lg"
                          onClick={() => setSelectedPlacementReport(att)}
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          View Proof
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Sheet for Marks Edit Request (7-Day Rule) */}
      <Sheet open={isAuditSheetOpen} onOpenChange={setIsAuditSheetOpen}>
        <SheetContent className="sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-sgvu-navy flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-sgvu-gold" />
              Review Marks Unlock Request
            </SheetTitle>
            <SheetDescription>
              A faculty member is requesting temporary unlock access to overwrite evaluation entries after the standard 7-day post-evaluation cutoff.
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
                      toast.error(`Marks unlock request from ${selectedAuditRequest.facultyName} has been rejected.`);
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
              Reassign course syllabus, students list, and evaluation control directly to another teacher or allocate to a new recruit placeholder.
            </DialogDescription>
          </DialogHeader>
          {handoverCourse && (
            <div className="py-4 space-y-4">
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500">SUBJECT DETAILS</span>
                  <span className="text-xs font-bold text-sgvu-navy">{handoverCourse.code} - {handoverCourse.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-500">CURRENT TEACHER</span>
                  <span className="text-xs font-bold text-red-600">
                    {facultyList.find((f) => f.id === handoverCourse.facultyId)?.name || 'Unassigned'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-sgvu-navy">Select Target Faculty</label>
                <Select value={handoverTargetFacultyId} onValueChange={setHandoverTargetFacultyId}>
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select target faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {facultyList.filter(f => f.id !== handoverCourse.facultyId).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
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
                  onClick={() => setHandoverCourse(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="default"
                  className="h-10 text-sm font-semibold bg-sgvu-navy hover:bg-sgvu-navy/90 text-white"
                  disabled={!handoverTargetFacultyId}
                  onClick={() => {
                    const targetFac = facultyList.find((f) => f.id === handoverTargetFacultyId);
                    setCoursesList(
                      coursesList.map((c) => (c.id === handoverCourse.id ? { ...c, facultyId: handoverTargetFacultyId === 'new_hire' ? null : handoverTargetFacultyId } : c))
                    );
                    setHandoverCourse(null);
                    toast.success(`Handover complete. ${handoverCourse.code} is now reassigned to ${targetFac?.name}.`);
                  }}
                >
                  Confirm Reassignment
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
                  onClick={() => {
                    toast.success(`Action Required alert sent to ${selectedMissedAttendance.facultyName} for pending logs.`);
                    setSelectedMissedAttendance(null);
                  }}
                >
                  Send Alert Notification
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
                          dept: f.department || 'CSE',
                          email: f.email,
                          status: f.name.includes('Gupta') ? 'On Resignation Notice' : 'Active',
                        }))
                      : [
                          { id: 'f-1', name: 'Prof. Sachin', desig: 'Professor', dept: 'CSE', email: 'sachin@sgvu.edu', status: 'Active' },
                          { id: 'f-2', name: 'Prof. Sharma', desig: 'Associate Professor', dept: 'CSE', email: 'sharma@sgvu.edu', status: 'Active' },
                          { id: 'f-3', name: 'Prof. Verma', desig: 'Assistant Professor', dept: 'CSE', email: 'verma@sgvu.edu', status: 'Active' },
                          { id: 'f-4', name: 'Prof. Gupta', desig: 'Assistant Professor', dept: 'CSE', email: 'gupta@sgvu.edu', status: 'On Resignation Notice' },
                        ]
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
              </div>
            )}

            {drillDownType === 'classes' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
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
                    {[{ time: '09:00 AM - 10:00 AM', code: 'CSE301', faculty: 'Prof. Sachin', room: 'LH-101' },
                      { time: '11:00 AM - 12:00 PM', code: 'CSE302', faculty: 'Prof. Sharma', room: 'LH-102' }].map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-700">{c.time}</td>
                        <td className="px-4 py-3 text-sgvu-navy font-bold">{c.code}</td>
                        <td className="px-4 py-3 text-slate-600">{c.faculty}</td>
                        <td className="px-4 py-3"><Badge className="bg-slate-100 text-slate-700">{c.room}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {drillDownType === 'attendance' && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Faculty</th>
                      <th className="px-4 py-3 text-right">Avg Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {[{ code: 'CSE301', name: 'Database Management Systems', fac: 'Prof. Sachin', att: '92%' },
                      { code: 'CSE302', name: 'Computer Networks', fac: 'Prof. Sharma', att: '89%' },
                      { code: 'CSE303', name: 'Software Engineering', fac: 'Prof. Verma', att: '85%' }].map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-bold text-sgvu-navy">{item.code}</p>
                          <p className="text-xs text-slate-500">{item.name}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.fac}</td>
                        <td className="px-4 py-3 text-right text-lg font-bold text-sgvu-navy">{item.att}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {drillDownType === 'inbox' && (
              <div className="space-y-3">
                {data.pending_inbox.map((row) => (
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
                  </div>
                ))}
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

      {/* Placement Proof Report Dialog */}
      <Dialog open={!!selectedPlacementReport} onOpenChange={(open) => { if (!open) setSelectedPlacementReport(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-sgvu-navy flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-sgvu-gold" />
              Interview Attendance Proof Report
            </DialogTitle>
            <DialogDescription>
              Consolidated placement drives appearance log. This document is verifiable proof for parent consultation.
            </DialogDescription>
          </DialogHeader>
          {selectedPlacementReport && (
            <div className="py-4 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between border-b border-slate-200/50 pb-2">
                  <span className="text-xs font-semibold text-slate-500">STUDENT NAME</span>
                  <span className="text-xs font-bold text-sgvu-navy">{selectedPlacementReport.studentName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/50 pb-2">
                  <span className="text-xs font-semibold text-slate-500">CURRENT BATCH</span>
                  <span className="text-xs font-bold text-sgvu-navy">Semester {selectedPlacementReport.semester}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Placement Drives Log</h4>
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {placementCompanies.filter(c => c.semester === selectedPlacementReport.semester).map((c) => {
                    const status = selectedPlacementReport.companyAttendance[c.id];
                    return (
                      <div key={c.id} className="flex justify-between items-center p-3 rounded-lg border border-slate-100 bg-white">
                        <div>
                          <p className="font-bold text-sgvu-navy">{c.name}</p>
                          <p className="text-[11px] text-slate-500 font-medium">{c.position} · {c.date}</p>
                        </div>
                        <div>
                          {status === 'APPEARED' ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-50">Appeared</Badge>
                          ) : status === 'ABSENT' ? (
                            <Badge className="bg-red-50 text-red-700 border border-red-200 font-bold hover:bg-red-50">Absent / Skipped</Badge>
                          ) : (
                            <Badge className="bg-slate-50 text-slate-400 border border-slate-200 font-semibold hover:bg-slate-50">Pending Verify</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="pt-4 gap-2">
                <Button
                  size="default"
                  variant="outline"
                  className="h-10 text-sm font-semibold border-slate-200"
                  onClick={() => {
                    toast.success(`Proof report printed for parents of ${selectedPlacementReport.studentName}.`);
                  }}
                >
                  Print Proof Report
                </Button>
                <Button
                  size="default"
                  className="h-10 text-sm font-semibold bg-sgvu-navy hover:bg-sgvu-navy/90 text-white"
                  onClick={() => setSelectedPlacementReport(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HodPageFrame>
  );
}
