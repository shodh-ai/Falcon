'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardCheck, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

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
};

type GatePassApproval = {
  pass_id: string;
  out_time: string;
  expected_in_time: string;
  reason: string;
  staff?: { name?: string; email?: string };
};

export default function FacultyDashboardPage() {
  const api = useAuthedApi();
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [hrSummary, setHrSummary] = useState<HrSummary | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovals>({ certificates: [] });
  const [gatePassApprovals, setGatePassApprovals] = useState<GatePassApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [classData, hrData, approvalData, gatePassData] = await Promise.all([
          api.get<FacultyClass[]>('/api/academics/faculty/timetable/today'),
          api.get<HrSummary>('/api/hr/attendance/my-summary'),
          api.get<PendingApprovals>('/api/academics/proctor/pending-approvals'),
          api.get<GatePassApproval[]>('/api/hr/gate-passes/pending-approvals'),
        ]);
        if (!cancelled) {
          setClasses(classData);
          setHrSummary(hrData);
          setPendingApprovals(approvalData);
          setGatePassApprovals(gatePassData);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load classes');
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

  async function webPunch() {
    setPunching(true);
    try {
      const nextAction = hrSummary?.today?.check_in_at && !hrSummary.today.check_out_at ? 'OUT' : 'IN';
      await api.post('/api/hr/attendance/web-punch', { action: nextAction });
      setHrSummary(await api.get<HrSummary>('/api/hr/attendance/my-summary'));
    } finally {
      setPunching(false);
    }
  }

  const punchLabel = hrSummary?.today?.check_in_at && !hrSummary.today.check_out_at
    ? 'Web Punch-Out'
    : 'Web Punch-In';

  const attendanceHref = (c: FacultyClass) => {
    return `/faculty/attendance?courseId=${encodeURIComponent(c.course_id)}`;
  };

  async function actOnGatePass(passId: string, status: 'APPROVED' | 'REJECTED') {
    await api.patch(`/api/hr/gate-passes/${passId}/action`, { status });
    setGatePassApprovals((prev) => prev.filter((pass) => pass.pass_id !== passId));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Faculty Dashboard</h2>
        <p className="text-sm text-muted-foreground">Command center for classes, HR punch, and mentorship approvals.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-sgvu-gold" />
              Web Attendance
            </CardTitle>
            <CardDescription>Web punch for today</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-black text-sgvu-navy">{hrSummary?.week_hours ?? 0}h</p>
            <p className="text-sm text-muted-foreground">Logged this week</p>
            <Button className="h-14 w-full text-base" onClick={webPunch} disabled={punching}>
              {punching ? <Loader2 className="h-4 w-4 animate-spin" /> : punchLabel}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-sgvu-gold" />
              Today&apos;s Classes
            </CardTitle>
            <CardDescription>Open academics, attendance, and digital assignments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading schedule…
              </div>
            )}
            {!loading && error && (
              <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
            )}
            {!loading && !error && classes.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No classes scheduled for today.
              </p>
            )}
            {!loading &&
              !error &&
              classes.map((c) => (
                <Link
                  key={c.timetable_id}
                  href={attendanceHref(c)}
                  className="flex w-full flex-col items-start justify-between gap-2 rounded-xl border border-input bg-background p-4 transition hover:bg-accent touch-target sm:flex-row sm:items-center"
                >
                  <span>
                    <span className="font-semibold text-sgvu-navy">{c.course_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.start_time.slice(0, 5)}-{c.end_time.slice(0, 5)} · {c.room ?? 'Room TBA'} · {c.student_count} students
                    </span>
                  </span>
                  <Badge variant="secondary">Mark Attendance</Badge>
                </Link>
              ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-sgvu-gold" />
                Pending Approvals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black text-sgvu-navy">{pendingApprovals.certificates.length} pending</p>
              <p className="text-sm text-muted-foreground">Extracurricular certificates from mentees</p>
              <Button asChild className="mt-4 w-full" variant="secondary">
                <Link href="/faculty/mentorship">Open queue</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-sgvu-gold" />
                Leave Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-muted p-3">
                <p className="font-bold text-sgvu-navy">4</p>
                <p className="text-xs text-muted-foreground">CL</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="font-bold text-sgvu-navy">6</p>
                <p className="text-xs text-muted-foreground">SL</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="font-bold text-sgvu-navy">12</p>
                <p className="text-xs text-muted-foreground">EL</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gate Pass Approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gatePassApprovals.length === 0 && (
                <p className="text-sm text-muted-foreground">No staff gate passes awaiting your action.</p>
              )}
              {gatePassApprovals.map((pass) => (
                <div key={pass.pass_id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium text-sgvu-navy">{pass.staff?.name ?? 'Staff member'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pass.out_time).toLocaleString()} · {pass.reason}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => actOnGatePass(pass.pass_id, 'APPROVED')}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => actOnGatePass(pass.pass_id, 'REJECTED')}>Reject</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
