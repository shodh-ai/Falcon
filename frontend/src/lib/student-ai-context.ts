/**
 * Student context for Falcon AI — live APIs first, demo data when empty/unavailable.
 */

import {
  DEMO_ASSIGNMENTS,
  DEMO_ATTENDANCE,
  DEMO_ATTENDANCE_SUMMARY,
  DEMO_DASHBOARD_METRICS,
  DEMO_EXAMS,
  DEMO_FEE_STRUCTURE,
  DEMO_MARKS,
  DEMO_PLACEMENTS,
  DEMO_STUDENT,
  DEMO_TODAY_SCHEDULE,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

export type StudentAiContext = {
  name: string;
  enrollment_no: string;
  program: string;
  branch: string;
  semester: number;
  section: string;
  cgpa: number;
  current_sgpa: number | null;
  credits_completed: number;
  credits_required: number;
  attendance_percent: number;
  fee_outstanding: number;
  fee_clear: boolean;
  pending_fee_heads: string[];
  next_fee_due: string | null;
  pending_assignments: number;
  upcoming_exams: Array<{ subject: string; exam_date: string; hall: string }>;
  placement_label: string;
  today_classes: Array<{ subject: string; start: string; end: string; room: string; faculty: string }>;
  subject_attendance: Array<{ course_code: string; course_name: string; percent: number }>;
  source: 'live' | 'demo' | 'mixed';
};

type AuthedGet = <T>(path: string) => Promise<T>;

function inr(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatInr(amount: number) {
  return inr(amount);
}

function demoContext(): StudentAiContext {
  const currentSem = DEMO_MARKS.semesters.find((s) => s.semester_number === DEMO_STUDENT.semester);
  const pendingFees = DEMO_FEE_STRUCTURE.filter((f) => f.payable_amount > 0);
  return {
    name: DEMO_STUDENT.name,
    enrollment_no: DEMO_STUDENT.enrollment_no,
    program: DEMO_STUDENT.program,
    branch: DEMO_STUDENT.branch,
    semester: DEMO_STUDENT.semester,
    section: DEMO_STUDENT.section,
    cgpa: DEMO_DASHBOARD_METRICS.cgpa,
    current_sgpa: currentSem?.sgpa ?? null,
    credits_completed: DEMO_DASHBOARD_METRICS.credits_completed,
    credits_required: DEMO_DASHBOARD_METRICS.credits_required,
    attendance_percent: DEMO_DASHBOARD_METRICS.attendance_percent,
    fee_outstanding: DEMO_DASHBOARD_METRICS.fee_outstanding,
    fee_clear: DEMO_DASHBOARD_METRICS.fee_clear,
    pending_fee_heads: pendingFees.map(
      (f) => `${f.fee_head.replace(/_/g, ' ')} (Sem ${f.semester ?? '—'}) — ${inr(f.payable_amount)}`,
    ),
    next_fee_due: pendingFees[0]?.due_date ?? null,
    pending_assignments: DEMO_ASSIGNMENTS.filter((a) => a.status !== 'Submitted').length,
    upcoming_exams: DEMO_EXAMS.slice(0, 4).map((ex) => ({
      subject: ex.subject,
      exam_date: ex.exam_date,
      hall: `${ex.hall} · Seat ${ex.seat}`,
    })),
    placement_label: DEMO_PLACEMENTS.summary_label,
    today_classes: DEMO_TODAY_SCHEDULE.map((s) => ({
      subject: s.subject,
      start: s.start,
      end: s.end,
      room: s.room,
      faculty: s.faculty,
    })),
    subject_attendance: DEMO_ATTENDANCE.map((r) => ({
      course_code: r.course_code,
      course_name: r.course_name,
      percent: Number(r.attendance_percent),
    })),
    source: 'demo',
  };
}

async function settled<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

let cachedContext: { at: number; value: StudentAiContext } | null = null;
const CONTEXT_TTL_MS = 60_000;

/** Load a student snapshot for Falcon AI answers (cached ~60s). */
export async function loadStudentAiContext(
  api: { get: AuthedGet },
  opts?: { force?: boolean },
): Promise<StudentAiContext> {
  if (
    !opts?.force &&
    cachedContext &&
    Date.now() - cachedContext.at < CONTEXT_TTL_MS
  ) {
    return cachedContext.value;
  }

  const demoOn = isStudentDemoModeEnabled();
  const base = demoOn
    ? demoContext()
    : {
        ...demoContext(),
        name: 'Student',
        enrollment_no: '—',
        program: '—',
        branch: '—',
        semester: 0,
        section: '—',
        cgpa: 0,
        current_sgpa: null,
        credits_completed: 0,
        attendance_percent: 0,
        fee_outstanding: 0,
        fee_clear: true,
        pending_fee_heads: [],
        next_fee_due: null,
        pending_assignments: 0,
        upcoming_exams: [],
        placement_label: 'No placement activity',
        today_classes: [],
        subject_attendance: [],
        source: 'live' as const,
      };

  const [profile, metrics, attendance, finance, marks, hub, today] = await Promise.all([
    settled(api.get<Record<string, unknown>>('/api/student/profile')),
    settled(api.get<Record<string, unknown>>('/api/academics/dashboard/metrics')),
    settled(api.get<Record<string, unknown>>('/api/student/attendance')),
    settled(api.get<Record<string, unknown>>('/api/student/finance')),
    settled(api.get<Record<string, unknown>>('/api/student/marks')),
    settled(api.get<Record<string, unknown>>('/api/placement/student/hub')),
    settled(api.get<Array<Record<string, unknown>>>('/api/academics/dashboard/timetable/today')),
  ]);

  const ctx: StudentAiContext = { ...base };
  let liveHits = 0;

  if (profile) {
    liveHits += 1;
    ctx.name = String(profile.name || ctx.name);
    ctx.enrollment_no = String(profile.enrollment_no || ctx.enrollment_no);
    ctx.program = String(profile.program || ctx.program);
    ctx.branch = String(profile.branch || ctx.branch);
    ctx.semester = Number(profile.semester) || ctx.semester;
  }

  if (metrics) {
    liveHits += 1;
    if (metrics.cgpa != null) ctx.cgpa = Number(metrics.cgpa);
    if (metrics.credits_completed != null) ctx.credits_completed = Number(metrics.credits_completed);
    if (metrics.credits_required != null) ctx.credits_required = Number(metrics.credits_required) || ctx.credits_required;
    if (metrics.attendance_percent != null) ctx.attendance_percent = Number(metrics.attendance_percent);
  }

  if (attendance) {
    liveHits += 1;
    if (attendance.overall_percent != null) {
      ctx.attendance_percent = Number(attendance.overall_percent);
    }
    const rows = Array.isArray(attendance.subject_wise) ? attendance.subject_wise : [];
    if (rows.length) {
      ctx.subject_attendance = rows.map((r: Record<string, unknown>) => ({
        course_code: String(r.course_code ?? ''),
        course_name: String(r.course_name ?? r.course_code ?? 'Subject'),
        percent: Number(r.attendance_percent ?? 0),
      }));
    } else if (!ctx.subject_attendance.length) {
      ctx.subject_attendance = DEMO_ATTENDANCE_SUMMARY
        ? DEMO_ATTENDANCE.map((r) => ({
            course_code: r.course_code,
            course_name: r.course_name,
            percent: Number(r.attendance_percent),
          }))
        : ctx.subject_attendance;
    }
  }

  if (finance) {
    liveHits += 1;
    const outstanding = Number(finance.total_outstanding ?? 0);
    const demands = Array.isArray(finance.pending_demands) ? finance.pending_demands : [];
    const structure = Array.isArray(finance.fee_structure) ? finance.fee_structure : [];
    const pending =
      demands.length > 0
        ? demands
        : structure.filter(
            (d: Record<string, unknown>) =>
              Number(d.payable_amount ?? d.amount ?? 0) > 0 &&
              !['PAID', 'WAIVED'].includes(String(d.status ?? '').toUpperCase()),
          );

    if (outstanding > 0 || pending.length > 0) {
      ctx.fee_outstanding =
        outstanding ||
        pending.reduce(
          (s: number, d: Record<string, unknown>) => s + Number(d.payable_amount ?? d.amount ?? 0),
          0,
        );
      ctx.fee_clear = ctx.fee_outstanding <= 0;
      ctx.pending_fee_heads = pending.map((d: Record<string, unknown>) => {
        const head = String(d.fee_head ?? 'Fee').replace(/_/g, ' ');
        const sem = d.semester != null ? ` (Sem ${d.semester})` : '';
        const amt = Number(d.payable_amount ?? d.amount ?? 0);
        return `${head}${sem} — ${inr(amt)}`;
      });
      ctx.next_fee_due = pending[0]?.due_date ? String(pending[0].due_date) : ctx.next_fee_due;
    } else if (finance.gates && (finance.gates as { finance_clear?: boolean }).finance_clear) {
      ctx.fee_outstanding = 0;
      ctx.fee_clear = true;
      ctx.pending_fee_heads = [];
    }
  }

  if (marks) {
    liveHits += 1;
    if (marks.cgpa != null && Number(marks.cgpa) > 0) ctx.cgpa = Number(marks.cgpa);
    const semesters = Array.isArray(marks.semesters) ? marks.semesters : [];
    const history = Array.isArray(marks.sgpa_history) ? marks.sgpa_history : [];
    if (semesters.length) {
      const current =
        semesters.find((s: { semester_number?: number }) => Number(s.semester_number) === ctx.semester) ??
        semesters[semesters.length - 1];
      if (current?.sgpa != null) ctx.current_sgpa = Number(current.sgpa);
      const credits = semesters.reduce(
        (s: number, row: { credits?: number }) => s + Number(row.credits ?? 0),
        0,
      );
      if (credits > 0) ctx.credits_completed = credits;
    } else if (history.length) {
      const latest = history[history.length - 1] as { sgpa?: number; semester?: number };
      if (latest?.sgpa != null) ctx.current_sgpa = Number(latest.sgpa);
    }
  }

  if (hub) {
    liveHits += 1;
    const apps = Array.isArray(hub.my_applications) ? hub.my_applications.length : 0;
    const drives = Array.isArray(hub.open_drives) ? hub.open_drives.length : 0;
    const locked = Boolean((hub.placement_lock as { locked?: boolean } | undefined)?.locked);
    ctx.placement_label = locked
      ? 'Placement locked — offer accepted'
      : drives || apps
        ? `Eligible · ${drives} open drive(s) · ${apps} application(s)`
        : DEMO_PLACEMENTS.summary_label;
  }

  if (Array.isArray(today) && today.length) {
    liveHits += 1;
    ctx.today_classes = today.slice(0, 6).map((row) => ({
      subject: String(row.subject ?? row.course_name ?? row.title ?? 'Class'),
      start: String(row.start_time ?? row.start ?? '09:00').slice(0, 5),
      end: String(row.end_time ?? row.end ?? '10:00').slice(0, 5),
      room: String(row.room ?? row.room_number ?? 'TBA'),
      faculty: String(row.faculty_name ?? row.faculty ?? 'Faculty'),
    }));
  }

  let source: StudentAiContext['source'] = 'live';
  if (liveHits >= 3) source = 'live';
  else if (liveHits > 0) source = demoOn ? 'mixed' : 'live';
  else source = demoOn ? 'demo' : 'live';
  ctx.source = source;

  // When demo is off and we have almost no live facts, zero inventable fields.
  if (!demoOn && liveHits === 0) {
    ctx.cgpa = 0;
    ctx.current_sgpa = null;
    ctx.attendance_percent = 0;
    ctx.fee_outstanding = 0;
    ctx.pending_fee_heads = [];
    ctx.today_classes = [];
    ctx.subject_attendance = [];
    ctx.upcoming_exams = [];
  }

  cachedContext = { at: Date.now(), value: ctx };
  return ctx;
}
