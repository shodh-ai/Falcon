'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { AlertTriangle, FileDown, ListChecks, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { academicsApi } from '@/lib/api/api.academics';
import { API_URL } from '@/lib/api/client';
import { examsApi, type ExamEligibilityResult, type ExamSchedule } from '@/lib/api/api.exams';
import { useAuthedApi } from '@/lib/api';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';

type TabKey = 'schedule' | 'admit' | 'reeval';

function formatTime(hhmmss: string) {
  return String(hhmmss).slice(0, 5);
}

type ExamDesk = {
  ufm_cases: { description: string; penalty_applied?: string; incident_type?: string }[];
  seating: { exam_name: string; block: string; room: string; seat: string; exam_date: string }[];
};

export default function StudentExamsPage() {
  const { token, user } = useAuth();
  const api = useAuthedApi();
  const [tab, setTab] = useState<TabKey>('schedule');
  const [examDesk, setExamDesk] = useState<ExamDesk | null>(null);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [eligibility, setEligibility] = useState<ExamEligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applications, setApplications] = useState<unknown[]>([]);
  const [results, setResults] = useState<unknown[]>([]);

  const ineligibleMessage = useMemo(() => {
    if (!eligibility || eligibility.eligible) return null;
    const duesReason = eligibility.reasons.find((r) => r.code === 'PENDING_FEE_DUES');
    const attendanceReason = eligibility.reasons.find((r) => r.code === 'ATTENDANCE_SHORTFALL');

    const lines: string[] = [];
    if (attendanceReason) {
      lines.push(`Attendance is ${eligibility.attendance_percent}% (minimum 75% required).`);
    }
    if (duesReason && Array.isArray((duesReason as any).details)) {
      const dues = (duesReason as any).details as Array<{ fee_head: string; outstanding: number }>;
      if (dues.length > 0) {
        const parts = dues.map((d) => `${d.fee_head} of ₹${Math.round(Number(d.outstanding))}`).join(' and ');
        lines.push(`Please clear your ${parts} to unlock.`);
      } else {
        lines.push('Please clear pending fee dues to unlock.');
      }
    }
    return lines.join(' ');
  }, [eligibility]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [sched, elig, apps] = await Promise.all([
          examsApi.schedule(token),
          examsApi.eligibility(token),
          examsApi.myApplications(token),
        ]);
        setSchedules(sched);
        setEligibility(elig);
        setApplications(apps);

        if (user?.user_id) {
          const studentResults = await academicsApi.studentResults(token, user.user_id);
          setResults(studentResults);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load examinations data');
      } finally {
        setLoading(false);
      }
    };
    void load();
    void api.get<ExamDesk>('/api/student/exam-desk').then(setExamDesk).catch(() => setExamDesk(null));
  }, [token, user?.user_id, api]);

  const downloadAdmitCard = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/academics/exams/admit-card`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'admit-card.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download admit card');
    }
  };

  const applyReevaluation = async (subjectId: number) => {
    if (!token) return;
    setError(null);
    try {
      await examsApi.apply(token, { subject_id: subjectId, application_type: 'RE_EVALUATION' });
      const apps = await examsApi.myApplications(token);
      setApplications(apps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply for re-evaluation');
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ className?: string }> }> = [
    { key: 'schedule', label: 'Exam Schedule & Seating', icon: ListChecks },
    { key: 'admit', label: 'Admit Card', icon: FileDown },
    { key: 'reeval', label: 'Backlogs & Re-evaluation', icon: RefreshCcw },
  ];

  const hasUfm = (examDesk?.ufm_cases?.length ?? 0) > 0;

  if (loading && schedules.length === 0) {
    return <StudentLoadingState label="Loading examination data…" />;
  }

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Exam Desk"
        description="Admit card, seating plans, revaluation — blocked when dues or attendance fall below thresholds."
      />

      {hasUfm && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 text-sm">
            <p className="font-bold text-destructive">UFM / Disciplinary notice — read only</p>
            {examDesk!.ufm_cases.map((c, i) => (
              <p key={i} className="mt-2">
                {c.incident_type ?? 'UFM'}: {c.description}
                {c.penalty_applied ? ` · Penalty: ${c.penalty_applied}` : ''}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {examDesk?.seating && examDesk.seating.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seating plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {examDesk.seating.map((s, i) => (
              <p key={i}>
                <strong>{s.exam_name}</strong> ({s.exam_date}): Block {s.block}, Room {s.room}, Seat {s.seat}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="space-y-1">
              <p className="font-semibold">Something went wrong</p>
              <p className="text-destructive/90">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <StudentTabBar
        tabs={tabs.map((t) => ({ id: t.key, label: t.label }))}
        active={tab}
        onChange={setTab}
      />

      {tab === 'schedule' ? (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Exams</CardTitle>
            <CardDescription>Dates, timings, venue, and seat details (when assigned)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming exams found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Venue</th>
                      <th className="py-2">Seat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.exam_schedule_id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-sgvu-navy">{s.exam_date}</td>
                        <td className="py-2 pr-3">{formatTime(s.start_time)} – {formatTime(s.end_time)}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="secondary">{s.exam_type.replace('_', ' ')}</Badge>
                        </td>
                        <td className="py-2 pr-3">{s.venue}</td>
                        <td className="py-2">{s.seat_no ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'admit' ? (
        <Card>
          <CardHeader>
            <CardTitle>Admit Card</CardTitle>
            <CardDescription>The system checks eligibility before generating your PDF</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border bg-background/60 px-4 py-3">
                <span>Attendance (min 75%)</span>
                {eligibility && eligibility.attendance_percent >= 75 ? (
                  <Badge variant="success">OK</Badge>
                ) : (
                  <Badge variant="destructive">{eligibility?.attendance_percent ?? '—'}%</Badge>
                )}
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-background/60 px-4 py-3">
                <span>Fee clearance</span>
                {eligibility && eligibility.reasons.some((r) => r.code === 'PENDING_FEE_DUES') ? (
                  <Badge variant="destructive">Pending</Badge>
                ) : (
                  <Badge variant="success">Clear</Badge>
                )}
              </div>
            </div>

            {ineligibleMessage ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <p className="font-semibold">Admit card locked</p>
                <p className="mt-1 text-destructive/90">{ineligibleMessage}</p>
              </div>
            ) : null}

            <Button
              className="w-full"
              size="lg"
              disabled={loading || !eligibility || !eligibility.eligible}
              onClick={downloadAdmitCard}
            >
              <FileDown className="h-4 w-4" />
              Download Admit Card (PDF)
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'reeval' ? (
        <Card>
          <CardHeader>
            <CardTitle>Backlogs & Re-evaluation</CardTitle>
            <CardDescription>Apply for re-evaluation; a fee demand will be created automatically</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-sgvu-navy">Eligible subjects (from results)</p>
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No results found.</p>
                  ) : (
                    <div className="space-y-2">
                      {results.slice(0, 6).map((row: any, idx) => (
                        <div key={String(row?.result_id ?? idx)} className="flex items-center justify-between rounded-xl border px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-sgvu-navy">Subject #{row?.subject_id ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">Grade: {row?.grade ?? row?.grade_letter ?? '—'}</p>
                          </div>
                          <Button size="sm" onClick={() => applyReevaluation(Number(row?.subject_id ?? 0))} disabled={!row?.subject_id}>
                            Apply
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-sgvu-navy">My applications</p>
                  {applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No applications yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {applications.slice(0, 8).map((app: any) => (
                        <div key={String(app.exam_application_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-sgvu-navy">
                              {String(app.application_type).replace('_', ' ')} for Subject #{app.subject_id}
                            </p>
                            <p className="text-xs text-muted-foreground">{app.created_at ? String(app.created_at).slice(0, 10) : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={app.status === 'APPROVED' ? 'success' : app.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                              {app.status}
                            </Badge>
                            <Badge variant={app.fee_status === 'PAID' ? 'success' : 'secondary'}>{app.fee_status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </StudentPageShell>
  );
}
