'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, FileDown, ListChecks, Lock, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { API_URL, authHeaders } from '@/lib/api/client';
import { examsApi, reevaluationMaximum, type ExamApplication, type ExamEligibilityResult, type ExamSchedule, type ReEvaluationResult } from '@/lib/api/api.exams';
import { useAuthedApi } from '@/lib/api';
import { StudentExemptionPanel } from '@/components/attendance/StudentExemptionPanel';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { DEMO_EXAMS } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';
import { toast } from '@/lib/notifications/falcon-toast';
import { extractApiErrorMessage } from '@/lib/notifications/parse-api-error';

type TabKey = 'schedule' | 'admit' | 'reeval';
type StudentExamResult = ReEvaluationResult;

function isFeeDueDetail(value: unknown): value is { fee_head: string; outstanding: number | string } {
  if (!value || typeof value !== 'object') return false;
  return 'fee_head' in value && typeof value.fee_head === 'string'
    && 'outstanding' in value && (typeof value.outstanding === 'number' || typeof value.outstanding === 'string')
    && String(value.outstanding).trim() !== '' && Number.isFinite(Number(value.outstanding));
}

function canApplyForResult(result: StudentExamResult) {
  const maximum = result.max_marks == null ? NaN : Number(result.max_marks);
  const obtained = result.marks_obtained == null || String(result.marks_obtained).trim() === '' ? NaN : Number(result.marks_obtained);
  return result.is_valid === true && result.can_apply_for_re_evaluation === true && typeof result.result_id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(result.result_id)
    && Number.isInteger(Number(result.subject_id)) && Number(result.subject_id) > 0
    && Number.isFinite(maximum) && maximum > 0 && Number.isFinite(obtained) && obtained >= 0 && obtained <= maximum;
}

function reEvalStatusLabel(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'Fee pending';
    case 'PENDING':
      return 'With Exam Cell';
    case 'ASSIGNED':
      return 'Faculty reassessing';
    case 'UNDER_REVIEW':
      return 'Report under review';
    case 'COMPLETED':
      return 'Report published';
    case 'REJECTED':
      return 'Declined';
    default:
      return status.replace('_', ' ');
  }
}

function formatTime(hhmmss: string) {
  return String(hhmmss).slice(0, 5);
}

function formatExamDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatExamType(type: string) {
  return type.replace(/_/g, ' ');
}

/** Split venue strings like "Block C — Hall A" or "Lab 204" into building + room. */
function parseVenue(venue: string | null | undefined): { building: string; room: string } {
  const raw = String(venue ?? '').trim();
  if (!raw) return { building: '—', room: '—' };

  const dashed = raw.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (dashed.length >= 2) {
    return { building: dashed[0], room: dashed.slice(1).join(' — ') };
  }

  const labOrRoom = raw.match(/^(Lab|Room)\s+(.+)$/i);
  if (labOrRoom) {
    return { building: labOrRoom[1], room: labOrRoom[2] };
  }

  return { building: raw, room: '—' };
}

function ExamTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-sgvu-navy/20 bg-sgvu-navy/5 text-[10px] font-bold uppercase tracking-wide text-sgvu-navy"
    >
      {formatExamType(type)}
    </Badge>
  );
}

type ExamDesk = {
  seating: {
    exam_name: string;
    block: string | null;
    room: string | null;
    seat: string | null;
    exam_date: string;
    seat_revealed?: boolean;
    seat_reveal_message?: string | null;
  }[];
};

export default function StudentExamsPage() {
  const { token, user } = useAuth();
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const intent = searchParams.get('intent');
  const [tab, setTab] = useState<TabKey>(
    intent === 'revaluation' ? 'reeval' : 'schedule',
  );
  const [previousIntent, setPreviousIntent] = useState(intent);
  // Apply a changed deep-link before rendering the tab rather than after paint.
  if (previousIntent !== intent) {
    setPreviousIntent(intent);
    if (intent === 'revaluation') setTab('reeval');
  }
  const [examDesk, setExamDesk] = useState<ExamDesk | null>(null);
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [eligibility, setEligibility] = useState<ExamEligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applications, setApplications] = useState<ExamApplication[]>([]);
  const [results, setResults] = useState<StudentExamResult[]>([]);
  const [applyingResultId, setApplyingResultId] = useState<string | null>(null);
  const [dataAccount, setDataAccount] = useState({ token, userId:user?.user_id });
  const applying = useRef(false);
  const account = useRef({ token, userId: user?.user_id });
  const [downloadingAdmit, setDownloadingAdmit] = useState(false);

  const ineligibleMessage = useMemo(() => {
    if (!eligibility || eligibility.eligible) return null;
    const duesReason = eligibility.reasons.find((r) => r.code === 'PENDING_FEE_DUES');
    const attendanceReason = eligibility.reasons.find((r) => r.code === 'ATTENDANCE_SHORTFALL');

    const lines: string[] = [];
    if (attendanceReason) {
      lines.push(`Attendance is ${eligibility.attendance_percent}% (minimum ${eligibility.min_required ?? 75}% required).`);
    }
    if (duesReason) {
      const dues = Array.isArray(duesReason.details) ? duesReason.details.filter(isFeeDueDetail) : [];
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
    let active = true;
    account.current = { token, userId: user?.user_id };
    // Clear the old account's results and in-flight actions before fetching the new account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataAccount({ token, userId:user?.user_id });
    applying.current = false;
    setApplyingResultId(null);
    setResults([]);
    setApplications([]);
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
        if (!active) return;
        const demoSchedules = () =>
          DEMO_EXAMS.map((ex, i) => ({
            exam_schedule_id: ex.exam_id,
            exam_type: ex.exam_type as ExamSchedule['exam_type'],
            subject_id: i + 1,
            exam_date: ex.exam_date,
            start_time: ex.start_time,
            end_time: ex.end_time,
            venue: ex.hall,
            seat_no: ex.seat,
          }));
        setSchedules(
          sched?.length
            ? sched
            : isStudentDemoModeEnabled()
              ? demoSchedules()
              : [],
        );
        setEligibility(elig);
        setApplications(apps);

        if (user?.user_id) {
          const studentResults = await examsApi.reEvaluationResults(token);
          if (active) setResults(studentResults);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load examinations data');
        setSchedules(
          isStudentDemoModeEnabled()
            ? DEMO_EXAMS.map((ex, i) => ({
                exam_schedule_id: ex.exam_id,
                exam_type: ex.exam_type as ExamSchedule['exam_type'],
                subject_id: i + 1,
                exam_date: ex.exam_date,
                start_time: ex.start_time,
                end_time: ex.end_time,
                venue: ex.hall,
                seat_no: ex.seat,
              }))
            : [],
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const demoSeating = () =>
      DEMO_EXAMS.map((ex) => ({
        exam_name: `${ex.course_code} — ${ex.subject}`,
        block: ex.hall.split('—')[0]?.trim() ?? ex.hall,
        room: ex.hall,
        seat: ex.seat,
        exam_date: ex.exam_date,
        seat_revealed: true,
      }));
    void api
      .get<ExamDesk>('/api/student/exam-desk')
      .then((desk) => {
        if (!active) return;
        if (!desk?.seating?.length) {
          setExamDesk({
            seating: isStudentDemoModeEnabled() ? demoSeating() : [],
          });
        } else {
          setExamDesk({ seating: desk.seating });
        }
      })
      .catch(() => {
        if (active) setExamDesk({
          seating: isStudentDemoModeEnabled() ? demoSeating() : [],
        });
      });
    return () => { active = false; account.current = { token, userId: user?.user_id }; };
  }, [token, user?.user_id, api]);

  const downloadAdmitCard = async () => {
    if (!token || downloadingAdmit) return;
    setDownloadingAdmit(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/academics/exams/admit-card`, {
        headers: authHeaders(token),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          extractApiErrorMessage(text, res.status, '/api/academics/exams/admit-card'),
        );
      }

      const blob = await res.blob();
      if (!blob.size) throw new Error('Admit card PDF was empty. Please retry.');
      const pdfBlob =
        blob.type === 'application/pdf'
          ? blob
          : new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SGVU-Admit-Card.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Admit card downloaded with full exam details');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to download admit card';
      setError(message);
      toast.error(message);
    } finally {
      setDownloadingAdmit(false);
    }
  };

  const applyReevaluation = async (result: StudentExamResult) => {
    if (!token || account.current.token !== token || account.current.userId !== user?.user_id || applying.current || !canApplyForResult(result)) return;
    const context = account.current;
    applying.current = true;
    setApplyingResultId(result.result_id!);
    setError(null);
    try {
      const created = await examsApi.apply(token, { subject_id: Number(result.subject_id), exam_result_id: result.result_id!, application_type: 'RE_EVALUATION' });
      if (account.current !== context) return;
      setApplications((current) => [{ ...created, exam_result_id: result.result_id }, ...current.filter((app) => app.exam_application_id !== created.exam_application_id)]);
      toast.success('Re-evaluation application submitted');
      try {
        const apps = await examsApi.myApplications(token);
        if (account.current === context) setApplications(apps);
      } catch (e) {
        if (account.current === context) setError(`Application submitted, but requests could not be refreshed. ${e instanceof Error ? e.message : 'Please refresh the page.'}`);
      }
    } catch (e) {
      if (account.current === context) setError(e instanceof Error ? e.message : 'Failed to apply for re-evaluation');
    } finally {
      if (account.current === context) { applying.current = false; setApplyingResultId(null); }
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ className?: string }> }> = [
    { key: 'schedule', label: 'Exam Schedule & Seating', icon: ListChecks },
    { key: 'admit', label: 'Admit Card', icon: FileDown },
    { key: 'reeval', label: 'Backlogs & Re-evaluation', icon: RefreshCcw },
  ];

  if (loading && schedules.length === 0) {
    return <StudentLoadingState label="Loading examination data…" />;
  }

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="Exams"
        description="Admit card, seating plans, revaluation — blocked when dues or attendance fall below thresholds."
      />

      {examDesk?.seating && examDesk.seating.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seating plan</CardTitle>
            <CardDescription>Room and seat numbers unlock 24 hours before each exam</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {examDesk.seating.map((s, i) => (
              <div key={i} className="rounded-xl border p-3">
                <p className="font-semibold text-sgvu-navy">{s.exam_name}</p>
                <p className="text-muted-foreground">{s.exam_date}</p>
                {s.seat_revealed ? (
                  <p className="mt-2">
                    Block {s.block}, Room {s.room}, Seat {s.seat}
                  </p>
                ) : (
                  <p className="mt-2 flex items-center gap-2 text-amber-800">
                    <Lock className="h-4 w-4" />
                    🔒 {s.seat_reveal_message ?? 'Will be revealed 24 hours prior to exam'}
                  </p>
                )}
              </div>
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
        tabs={tabs.map((t) => ({
          id: t.key,
          label: t.label,
          shortLabel:
            t.key === 'schedule' ? 'Schedule' : t.key === 'admit' ? 'Admit' : 'Re-eval',
        }))}
        active={tab}
        onChange={setTab}
      />

      {tab === 'schedule' ? (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Exams</CardTitle>
            <CardDescription>Dates, timings, building, and room number</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming exams found.</p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {schedules.map((s) => {
                    const venue = parseVenue(s.venue);
                    return (
                      <div
                        key={s.exam_schedule_id}
                        className="rounded-xl border border-border/70 bg-muted/20 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sgvu-navy">{formatExamDate(s.exam_date)}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {formatTime(s.start_time)} – {formatTime(s.end_time)}
                            </p>
                          </div>
                          <ExamTypeBadge type={s.exam_type} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Building
                            </p>
                            <p className="mt-0.5 text-sm font-medium leading-snug text-sgvu-navy">
                              {venue.building}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Room
                            </p>
                            <p className="mt-0.5 text-sm font-medium leading-snug text-sgvu-navy">
                              {venue.room}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-[22%] py-2 pr-3">Date</th>
                        <th className="w-[18%] py-2 pr-3">Time</th>
                        <th className="w-[16%] py-2 pr-3">Type</th>
                        <th className="w-[22%] py-2 pr-3">Building</th>
                        <th className="w-[22%] py-2">Room</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((s) => {
                        const venue = parseVenue(s.venue);
                        return (
                          <tr key={s.exam_schedule_id} className="border-b last:border-0">
                            <td className="py-3 pr-3 align-middle font-medium text-sgvu-navy">
                              {formatExamDate(s.exam_date)}
                            </td>
                            <td className="whitespace-nowrap py-3 pr-3 align-middle">
                              {formatTime(s.start_time)} – {formatTime(s.end_time)}
                            </td>
                            <td className="py-3 pr-3 align-middle">
                              <ExamTypeBadge type={s.exam_type} />
                            </td>
                            <td className="py-3 pr-3 align-middle text-sgvu-navy">{venue.building}</td>
                            <td className="py-3 align-middle text-sgvu-navy">{venue.room}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
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
                <span>Attendance (min {eligibility?.min_required ?? 75}%)</span>
                {eligibility && eligibility.exempted ? (
                  <Badge variant="success">Exempted</Badge>
                ) : eligibility && eligibility.attendance_percent >= (eligibility.min_required ?? 75) ? (
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

            {eligibility &&
            (eligibility.exempted ||
              eligibility.attendance_percent < (eligibility.min_required ?? 75)) ? (
              <StudentExemptionPanel
                canRequest={
                  !eligibility.exempted &&
                  eligibility.attendance_percent < (eligibility.min_required ?? 75)
                }
              />
            ) : null}

            <Button
              className="w-full"
              size="lg"
              disabled={
                loading ||
                downloadingAdmit ||
                !eligibility ||
                !eligibility.eligible
              }
              onClick={() => void downloadAdmitCard()}
            >
              <FileDown className="h-4 w-4" />
              {downloadingAdmit ? 'Preparing PDF…' : 'Download Admit Card (PDF)'}
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
                  <p className="text-sm font-semibold text-sgvu-navy">Choose the exam result to re-evaluate</p>
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No results found.</p>
                  ) : (
                    <div className="space-y-2">
                      {results.map((row, idx) => (
                        <div key={String(row?.result_id ?? idx)} className="flex items-center justify-between rounded-xl border px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-sgvu-navy">{row.subject_name ?? `Subject #${row.subject_id ?? '—'}`}{row.subject_code ? ` (${row.subject_code})` : ''}</p>
                            <p className="text-xs text-muted-foreground">{row.exam_session ?? (canApplyForResult(row) ? 'Published exam result' : 'Session unavailable')} · {row.exam_type?.replaceAll('_', ' ') ?? 'Exam type unavailable'}</p>
                            <p className="text-xs text-muted-foreground">Marks: {row.marks_obtained ?? 'Not recorded'} / {row.max_marks ?? 'Unavailable'}</p>
                            <p className="text-xs text-muted-foreground">Grade: {row?.grade ?? row?.grade_letter ?? '—'}</p>
                            {!canApplyForResult(row) ? <p className="text-xs text-amber-800">{row.validation_message || row.re_evaluation_eligibility_message || 'Exam Cell must verify this result’s official declaration source before a paid re-evaluation can be requested.'}</p> : null}
                          </div>
                          <Button size="sm" onClick={() => void applyReevaluation(row)} disabled={dataAccount.token !== token || dataAccount.userId !== user?.user_id || Boolean(applyingResultId) || !canApplyForResult(row) || applications.some((app) => app.application_type === 'RE_EVALUATION' && app.exam_result_id === row.result_id && app.status !== 'REJECTED')}>
                            {applyingResultId === row.result_id ? 'Applying…' : applications.some((app) => app.application_type === 'RE_EVALUATION' && app.exam_result_id === row.result_id && app.status !== 'REJECTED') ? 'Applied' : 'Apply'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-sgvu-navy">My re-evaluation requests</p>
                  {applications.filter((app) => app.application_type === 'RE_EVALUATION').length === 0 ? (
                    <p className="text-sm text-muted-foreground">No applications yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {applications
                        .filter((app) => app.application_type === 'RE_EVALUATION')
                        .map((app) => (
                          <div key={app.exam_application_id} className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sgvu-navy">
                                  {app.subject_name ?? `Subject #${app.subject_id}`}
                                  {app.subject_code ? ` (${app.subject_code})` : ''}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Applied {app.created_at ? String(app.created_at).slice(0, 10) : ''}
                                  {app.faculty_name ? ` · Faculty: ${app.faculty_name}` : ''}
                                </p>
                                <p className="text-xs text-muted-foreground">{app.exam_session ?? (reevaluationMaximum(app) !== null ? 'Published exam result' : 'Exam link awaiting Exam Cell')}{app.exam_type ? ` · ${app.exam_type.replaceAll('_', ' ')}` : ''} · Maximum marks: {app.exam_max_marks ?? 'Unavailable'}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={app.status === 'COMPLETED' ? 'success' : app.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                                  {reEvalStatusLabel(app.status)}
                                </Badge>
                                <Badge variant={app.fee_status === 'PAID' ? 'success' : 'secondary'}>{app.fee_status}</Badge>
                              </div>
                            </div>

                            {app.status === 'COMPLETED' ? (
                              <div className="mt-3 rounded-lg border bg-green-50 p-3 text-green-900">
                                <p className="font-semibold">Reassessment report</p>
                                {app.original_marks != null || app.revised_marks != null ? (
                                  <p className="mt-1">
                                    Marks: {app.original_marks ?? '—'} → {app.revised_marks ?? '—'}
                                  </p>
                                ) : null}
                                {app.report_notes ? (
                                  <p className="mt-2 whitespace-pre-wrap text-green-800">{app.report_notes}</p>
                                ) : null}
                              </div>
                            ) : null}

                            {app.status === 'REJECTED' && app.report_notes ? (
                              <p className="mt-2 text-destructive">{app.report_notes}</p>
                            ) : null}
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
