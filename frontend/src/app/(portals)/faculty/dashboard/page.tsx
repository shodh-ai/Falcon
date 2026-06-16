'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck,
  Clock,
  Inbox,
  ShieldCheck,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyStatCard,
  FacultyPanel,
  FacultyEmptyState,
  FacultyInlineLoading,
  FacultyErrorBanner,
} from '@/components/faculty';

type FacultyClass = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  start_time: string;
  end_time: string;
  student_count: number;
};

type HrSummary = {
  today: { check_in_at: string | null; check_out_at: string | null } | null;
  week_hours: number;
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

const PROFILE_COMPLIANCE_KEY = 'faculty-profile-compliance-dismissed';

export default function FacultyDashboardPage() {
  const api = useAuthedApi();
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [hrSummary, setHrSummary] = useState<HrSummary | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovals>({ certificates: [] });
  const [gatePassApprovals, setGatePassApprovals] = useState<GatePassApproval[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [profileCompliance, setProfileCompliance] = useState<{ needs_academic_profile: boolean; message: string | null } | null>(null);
  const [complianceDismissed, setComplianceDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setComplianceDismissed(localStorage.getItem(PROFILE_COMPLIANCE_KEY) === '1');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [classData, hrData, approvalData, gatePassData, balanceData, complianceData] = await Promise.all([
          api.get<FacultyClass[]>('/api/academics/faculty/timetable/today').catch(() => []),
          api.get<HrSummary>('/api/hr/workforce/today').catch(() =>
            api.get<HrSummary>('/api/hr/attendance/my-summary').catch(() => null),
          ),
          api.get<PendingApprovals>('/api/academics/proctor/pending-approvals').catch(() => ({ certificates: [] })),
          api.get<GatePassApproval[]>('/api/hr/gate-passes/pending-approvals').catch(() => []),
          api.get<LeaveBalance[]>('/api/hr/leaves/my-balances').catch(() => []),
          api.get<{ needs_academic_profile: boolean; message: string | null }>(
            '/api/academics/faculty/profile/compliance',
          ).catch(() => null),
        ]);
        if (!cancelled) {
          setClasses(classData);
          setHrSummary(hrData);
          setPendingApprovals(approvalData);
          setGatePassApprovals(gatePassData);
          setLeaveBalances(balanceData);
          if (complianceData) setProfileCompliance(complianceData);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load dashboard');
          setClasses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const attendanceHref = (c: FacultyClass) =>
    `/faculty/attendance?courseId=${encodeURIComponent(c.course_id)}`;

  async function actOnGatePass(passId: string, status: 'APPROVED' | 'REJECTED') {
    await api.patch(`/api/hr/gate-passes/${passId}/action`, { status });
    setGatePassApprovals((prev) => prev.filter((pass) => pass.pass_id !== passId));
  }

  const pendingCerts = pendingApprovals.certificates.length;
  const pendingMeetings = pendingApprovals.meetings?.length ?? 0;
  const pendingLeaves = pendingApprovals.leave_requests?.length ?? 0;
  const totalPending = pendingCerts + pendingMeetings + pendingLeaves;

  const balanceRemaining = (type: string) => {
    const row = leaveBalances.find((b) => b.leave_type === type);
    if (!row) return '—';
    return Math.max(0, Number(row.entitled) - Number(row.used));
  };

  const inTime = (hrSummary as { display?: { in_time: string } })?.display?.in_time ?? '—';
  const outTime = (hrSummary as { display?: { out_time: string } })?.display?.out_time ?? '—';

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        variant="hero"
        title="Good morning — here is your day"
        description="Classes, attendance, approvals, and HR at a glance."
      />

      {!complianceDismissed && profileCompliance?.needs_academic_profile && (
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
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FacultyStatCard
          label="Classes today"
          value={loading ? '—' : classes.length}
          icon={ClipboardCheck}
          accent="gold"
        />
        <FacultyStatCard
          label="Pending approvals"
          value={totalPending}
          sub={`${pendingCerts} certs · ${pendingMeetings} meetings · ${pendingLeaves} leaves`}
          icon={Inbox}
          accent={totalPending > 0 ? 'alert' : 'navy'}
          alert={totalPending > 0}
        />
        <FacultyStatCard
          label="Gate passes"
          value={gatePassApprovals.length}
          icon={ShieldCheck}
          accent={gatePassApprovals.length > 0 ? 'alert' : 'navy'}
        />
        <FacultyStatCard
          label="Biometric today"
          value={inTime}
          sub={`Out: ${outTime}`}
          icon={Clock}
          accent="navy"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FacultyPanel
          title="Today's classes"
          count={classes.length}
          href="/faculty/timetable"
          description="Tap a class to mark attendance"
          className="lg:col-span-2"
        >
          {loading && <FacultyInlineLoading label="Loading schedule…" />}
          {!loading && error && <FacultyErrorBanner message={error} />}
          {!loading && !error && classes.length === 0 && (
            <FacultyEmptyState
              title="No classes today"
              description="Your timetable has no sessions scheduled for today."
            />
          )}
          {!loading && !error && classes.length > 0 && (
            <div className="space-y-2">
              {classes.map((c) => (
                <Link
                  key={c.timetable_id}
                  href={attendanceHref(c)}
                  className="flex flex-col items-start justify-between gap-2 rounded-xl border border-border/60 bg-background p-4 transition hover:border-sgvu-gold/50 hover:bg-accent/40 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sgvu-navy">
                      {c.course_code} · {c.course_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)} · {c.room ?? 'Room TBA'} ·{' '}
                      {c.student_count} students
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">Mark attendance</Badge>
                </Link>
              ))}
            </div>
          )}
        </FacultyPanel>

        <div className="space-y-4">
          <FacultyPanel title="Pending approvals" count={totalPending} href="/faculty/inbox">
            <p className="text-sm text-muted-foreground">
              Mentorship certificates, meetings, and leave requests awaiting action.
            </p>
            <Button asChild className="mt-3 w-full" variant="secondary" size="sm">
              <Link href="/faculty/inbox">Open inbox</Link>
            </Button>
          </FacultyPanel>

          <FacultyPanel title="Leave balance">
            <div className="grid grid-cols-3 gap-2 text-center">
              {(['CL', 'SL', 'EL'] as const).map((type) => (
                <div key={type} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="text-xl font-bold text-sgvu-navy">{balanceRemaining(type)}</p>
                  <p className="text-xs text-muted-foreground">{type}</p>
                </div>
              ))}
            </div>
            <Button asChild className="mt-3 w-full" variant="outline" size="sm">
              <Link href="/faculty/me/workforce">Leaves & attendance</Link>
            </Button>
          </FacultyPanel>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FacultyPanel title="Gate pass approvals" count={gatePassApprovals.length}>
          {gatePassApprovals.length === 0 ? (
            <FacultyEmptyState description="No staff gate passes awaiting your action." />
          ) : (
            <div className="space-y-2">
              {gatePassApprovals.map((pass) => (
                <div key={pass.pass_id} className="rounded-xl border border-border/60 p-3 text-sm">
                  <p className="font-medium text-sgvu-navy">{pass.staff?.name ?? 'Staff member'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pass.out_time).toLocaleString()} · {pass.reason}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => actOnGatePass(pass.pass_id, 'APPROVED')}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => actOnGatePass(pass.pass_id, 'REJECTED')}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel
          title="Early warning system"
          description="Students at risk in your classes"
          className="border-red-200/60 bg-red-50/20"
        >
          <p className="text-sm text-red-800">
            Review students below attendance or performance thresholds and schedule interventions.
          </p>
          <Button asChild className="mt-3 w-full bg-red-700 hover:bg-red-800 text-white" size="sm">
            <Link href="/faculty/at-risk">View at-risk students</Link>
          </Button>
        </FacultyPanel>
      </div>
    </FacultyPageShell>
  );
}
