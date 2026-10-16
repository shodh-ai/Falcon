'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  Download,
  FileDown,
  Layers3,
} from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentInternalMarksPanel } from '@/components/student/StudentInternalMarksPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';
import { withStudentReadTimeout } from '@/lib/student-read-request';
import { getSemesterGpa } from '@/lib/student-semester-gpa';

type CourseRow = {
  course_id: string;
  course_code: string;
  course_name: string;
  course_type: string;
  credits: number;
  grade: string;
  grade_points?: number | null;
  status: string;
};

type SemesterRow = {
  semester_number: number;
  sgpa: number | null;
  credits: number;
  credits_earned?: number;
  credits_attempted?: number;
  courses: CourseRow[];
};

type ComponentSubject = {
  course_id: string;
  course_code: string;
  course_name: string;
  components: { key: string; label: string; marks_obtained: number; max_marks: number }[];
  total_internal_obtained: number;
  total_internal_max: number;
};

type GradeCard = {
  grade_card_id: string;
  semester: number;
  status: 'DRAFT' | 'PUBLISHED' | 'WITHHELD';
  published_at: string | null;
  payload: {
    result_stage?: 'DRAFT' | 'PROVISIONAL' | 'FINAL';
    sgpa?: number;
    cgpa?: number;
    rank?: number | null;
    withheld_reason?: string;
  } | null;
};

type ExamReport = {
  report_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  marks_obtained: string | number;
  max_marks: string | number;
  percent: string | number | null;
  grade: string | null;
  result_status: string;
  report_summary: string | null;
  declared_at: string;
};

type MarksHistory = {
  cgpa: number | null;
  total_credits_earned: number;
  total_credits_attempted?: number;
  total_semesters?: number;
  current_semester?: number;
  semesters: SemesterRow[];
  component_marks_by_semester: { semester_number: number; subjects: ComponentSubject[] }[];
  exam_reports?: ExamReport[];
  grade_cards?: GradeCard[];
  backlogs: {
    uncleared: { course_id: string; course_code: string; course_name: string; semester: number }[];
    cleared: { course_code: string; course_name: string; semester: number }[];
  };
};

function courseStatusMeta(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'PASS' || normalized === 'COMPLETED') {
    return { label: 'Passed', className: 'bg-sgvu-navy text-white' };
  }
  if (normalized === 'FAIL' || normalized === 'FAILED') {
    return { label: 'Failed', className: 'bg-destructive text-white' };
  }
  return { label: 'In progress', className: 'bg-sgvu-gold text-sgvu-navy' };
}

function resultStatusMeta(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('PASS')) {
    return { label: 'Passed', className: 'bg-sgvu-navy text-white' };
  }
  if (normalized.includes('FAIL')) {
    return { label: 'Failed', className: 'bg-destructive text-white' };
  }
  return {
    label: status.replaceAll('_', ' '),
    className: 'bg-sgvu-gold text-sgvu-navy',
  };
}

function cardStageMeta(status: string, stage: string) {
  if (status === 'WITHHELD') {
    return { label: 'Held', className: 'bg-destructive text-white', hint: 'Contact exam cell' };
  }
  if (status === 'PUBLISHED' && stage === 'FINAL') {
    return { label: 'Final', className: 'bg-sgvu-navy text-white', hint: 'Official final card' };
  }
  if (status === 'PUBLISHED' && stage === 'PROVISIONAL') {
    return { label: 'Provisional', className: 'bg-sgvu-gold text-sgvu-navy', hint: 'Temporary result' };
  }
  return { label: 'Awaiting grade card', className: 'bg-white text-sgvu-navy border border-sgvu-navy/20', hint: 'The official semester grade card is not published yet.' };
}

function examTypeLabel(examType: string) {
  return examType
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StudentMarksWorkspace() {
  const { token } = useAuth();
  return <StudentMarksContent key={token} />;
}

function formatGpa(value: number | null | undefined) {
  return value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';
}

function semesterNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function semesterEarnedCredits(semester: SemesterRow | null): number | null {
  if (!semester) return null;
  if (semester.credits_earned !== undefined) {
    const credits = Number(semester.credits_earned);
    return semester.credits_earned != null && Number.isFinite(credits) && credits >= 0 ? credits : null;
  }
  // Legacy history responses omit earned credits; only passed courses earn them.
  if (!Array.isArray(semester.courses)) return null;
  let total = 0;
  for (const course of semester.courses) {
    if (!['PASS', 'COMPLETED'].includes(course.status.toUpperCase())) continue;
    const credits = Number(course.credits);
    if (course.credits == null || !Number.isFinite(credits) || credits < 0) return null;
    total += credits;
  }
  return total;
}

function StudentMarksContent() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [data, setData] = useState<MarksHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [semesterSelection, setSelectedSemester] = useState<number | null>(null);
  const [profileSemester, setProfileSemester] = useState<number | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [view, setView] = useState<'subjects' | 'internals' | 'downloads'>('subjects');
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void withStudentReadTimeout(api.get<MarksHistory>('/api/academics/marks/history'))
      .then((payload) => {
        if (cancelled) return;
        if (!payload || !Array.isArray(payload.semesters)) throw new Error('Invalid results');
        setData(payload);
        setLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setSelectedSemester(null);
        setLoadError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    void withStudentReadTimeout(api.get<{ semester?: number | string }>('/api/student/profile'))
      .then((profile) => { if (!cancelled) setProfileSemester(semesterNumber(profile?.semester)); })
      .catch(() => { if (!cancelled) setProfileSemester(null); })
      .finally(() => { if (!cancelled) setProfileLoading(false); });
    return () => { cancelled = true; };
  }, [api, loadAttempt]);

  const currentSemester = profileSemester ?? semesterNumber(data?.current_semester);
  const selectedSemester = semesterSelection ?? currentSemester;

  const semesterNumbers = useMemo(() => {
    const available = [...(data?.semesters ?? []).map((s) => s.semester_number),
      ...(data?.component_marks_by_semester ?? []).map((s) => s.semester_number),
      ...(data?.grade_cards ?? []).map((s) => s.semester), currentSemester ?? 0];
    const count = Math.max(Number(data?.total_semesters ?? 0), ...available.map(Number));
    return Array.from({ length: Math.max(0, count) }, (_, i) => i + 1);
  }, [data, currentSemester]);

  const semestersWithData = useMemo(() => {
    const nums = new Set<number>();
    for (const s of data?.semesters ?? []) nums.add(s.semester_number);
    for (const s of data?.component_marks_by_semester ?? []) nums.add(s.semester_number);
    for (const c of data?.grade_cards ?? []) nums.add(Number(c.semester));
    return nums;
  }, [data]);

  const selectedSemesterData = useMemo(
    () => data?.semesters.find((s) => s.semester_number === selectedSemester) ?? null,
    [data, selectedSemester],
  );

  const selectedComponents = useMemo(
    () =>
      data?.component_marks_by_semester.find((s) => s.semester_number === selectedSemester)
        ?.subjects ?? [],
    [data, selectedSemester],
  );

  const selectedGradeCard = useMemo(
    () => data?.grade_cards?.find((c) => Number(c.semester) === selectedSemester) ?? null,
    [data, selectedSemester],
  );

  const uncleared = data?.backlogs?.uncleared ?? [];
  const cleared = data?.backlogs?.cleared ?? [];
  const latestReports = (data?.exam_reports ?? []).slice(0, 4);

  async function downloadMarksheet(semester: number, type: 'provisional' | 'final') {
    if (!token) return;
    try {
      const res = await fetch(
        `${API_URL}/api/academics/marksheet/download/${semester}?type=${type}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          message = JSON.parse(text).message ?? text;
        } catch {
          /* keep text */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-marksheet-semester-${semester}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  }

  if (loading && !data) {
    return <StudentLoadingState label="Loading your scorecard…" />;
  }

  if (loadError || !data) {
    return <StudentPageShell width="full" className="max-w-[1400px]">
      <StudentPageHeader title="Results" description="Your grades and academic progress." eyebrow="Academic scorecard" />
      <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p>Could not load your results. Please try again.</p>
        <Button className="mt-3" variant="outline" onClick={() => { setLoading(true); setLoadAttempt((attempt) => attempt + 1); }}>Retry results</Button>
      </div>
    </StudentPageShell>;
  }

  const stage = selectedGradeCard?.payload?.result_stage ?? 'DRAFT';
  const stageMeta = cardStageMeta(selectedGradeCard?.status ?? 'DRAFT', stage);
  const canProvisional =
    !!selectedGradeCard &&
    selectedGradeCard.status === 'PUBLISHED' &&
    (stage === 'PROVISIONAL' || stage === 'FINAL');
  const canFinal =
    !!selectedGradeCard && selectedGradeCard.status === 'PUBLISHED' && stage === 'FINAL';
  const sgpa = getSemesterGpa(selectedSemesterData);
  const earnedCredits = semesterEarnedCredits(selectedSemesterData);
  const semesterBacklogCount = selectedSemester == null || !selectedSemesterData || !Array.isArray(data.backlogs?.uncleared)
    ? null
    : new Set(uncleared.filter((item) => Number(item.semester) === selectedSemester).map((item) => item.course_id)).size;
  const semesterContext = selectedSemester == null ? 'Select a semester' : `Semester ${selectedSemester}`;
  const hasSemesterResults = sgpa != null || (earnedCredits ?? 0) > 0 ||
    selectedSemesterData?.courses.some((course) => ['PASS', 'FAIL', 'COMPLETED', 'FAILED'].includes(course.status.toUpperCase()));

  return (
    <StudentPageShell width="full" className="max-w-[1400px]">
      <StudentPageHeader
        title="Results"
        description="View your current semester’s GPA, compare semester results, and check each subject’s grades."
        eyebrow="Academic scorecard"
      />

      {/* Score hero */}
      <section aria-label="Semester academic summary" className="overflow-hidden rounded-[1.5rem] border border-sgvu-navy/10 bg-white shadow-sm">
        <div className="grid md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="bg-sgvu-navy p-5 text-white sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">{selectedSemester == null ? 'Semester GPA (SGPA)' : `Semester ${selectedSemester} GPA (SGPA)`}</p>
            <p className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {formatGpa(sgpa)}
            </p>
            <p className="mt-2 max-w-sm text-sm text-white/70">
              {selectedSemester == null ? (profileLoading ? 'Loading current semester…' : 'Choose a semester below') : sgpa == null ? 'Awaiting grades' : 'Selected semester · Credit-weighted'}
            </p>
          </div>
          <div className="border-b border-sgvu-navy/10 p-5 text-sgvu-navy sm:p-6 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 text-sgvu-navy">
              <Award className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Credits earned</p>
            </div>
            <p className="mt-3 text-3xl font-black">{earnedCredits ?? '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{semesterContext} · {hasSemesterResults ? 'Passed subjects only' : 'Awaiting results'}</p>
            {selectedSemesterData?.credits_attempted != null ? <p className="mt-2 text-xs text-muted-foreground">{selectedSemesterData.credits_attempted} graded credits in this semester</p> : null}
          </div>
          <div className="p-5 text-sgvu-navy sm:p-6">
            <div className="flex items-center gap-2 text-sgvu-navy">
              {(semesterBacklogCount ?? 0) === 0 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Subjects to clear</p>
            </div>
            <p className="mt-3 text-3xl font-black">{semesterBacklogCount ?? '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {semesterContext} · {(semesterBacklogCount ?? 0) > 0
                ? 'Failed subjects to clear'
                : hasSemesterResults ? 'No failed subjects recorded' : 'Awaiting results'}
            </p>
          </div>
        </div>
        <details className="border-t border-sgvu-navy/10 bg-slate-50/70 px-5 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-sgvu-navy">How semester GPA is calculated</summary>
          <p className="mt-2">Total (subject credits × grade points) ÷ total graded credits in the selected semester. Failed subjects count; subjects without a grade do not. Awaiting grades means no GPA is available yet, not a score of zero.</p>
        </details>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Semester picker */}
          <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                Filter by semester
              </p>
              <h2 className="mt-1 text-lg font-bold text-sgvu-navy">Your semester scorecard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a semester to update the GPA above and see its subjects. Your current semester opens by default.
              </p>
              {!profileLoading && currentSemester == null ? <p role="status" className="mt-2 text-sm text-amber-800">Current semester unavailable. Select a semester below.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:pb-1">
              {semesterNumbers.map((n) => {
                const active = n === selectedSemester;
                const hasData = semestersWithData.has(n);
                const semesterGpa = getSemesterGpa(data.semesters.find((s) => s.semester_number === n));
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Semester ${n}`}
                    onClick={() => {
                      setSelectedSemester(n);
                      setView('subjects');
                    }}
                    className={cn(
                      'min-w-[4.5rem] rounded-xl border px-3 py-2.5 text-center transition',
                      active
                        ? 'border-sgvu-navy bg-sgvu-navy text-white shadow-sm'
                        : hasData
                          ? 'border-sgvu-navy/15 bg-white text-sgvu-navy hover:border-sgvu-gold hover:bg-sgvu-gold/15'
                          : 'border-dashed border-sgvu-navy/15 bg-slate-50 text-muted-foreground hover:border-sgvu-navy/30',
                    )}
                  >
                    <span className="block text-sm font-bold">Semester {n}</span>
                    <span className="mt-1 block text-[10px] opacity-80">{semesterGpa != null ? `GPA ${formatGpa(semesterGpa)}` : hasData ? 'Awaiting grades' : 'No results yet'}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected semester summary */}
          <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 border-b border-sgvu-navy/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black text-sgvu-navy">
                    Semester {selectedSemester ?? '—'}
                  </h3>
                  <Badge className={cn('border-transparent', stageMeta.className)}>
                    {stageMeta.label}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{stageMeta.hint}</p>
                {selectedGradeCard?.payload?.withheld_reason ? (
                  <p className="mt-2 text-sm text-destructive">
                    {selectedGradeCard.payload.withheld_reason}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Semester GPA (SGPA)</p>
                  <p className="text-xl font-black text-sgvu-navy">
                    {formatGpa(sgpa)}
                  </p>
                  {selectedSemester != null && sgpa == null ? <p className="mt-1 text-[11px] text-muted-foreground">Awaiting grades</p> : null}
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Credits earned</p>
                  <p className="text-xl font-black text-sgvu-navy">
                    {earnedCredits ?? '—'}
                  </p>
                  {selectedSemesterData?.credits_attempted != null ? <p className="mt-1 text-[11px] text-muted-foreground">of {selectedSemesterData.credits_attempted} graded credits</p> : null}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  { id: 'subjects', label: 'Subject grades', icon: BookOpen },
                  { id: 'internals', label: 'Internal marks', icon: Layers3 },
                  { id: 'downloads', label: 'Download PDF', icon: FileDown },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setView(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition',
                      active
                        ? 'border-sgvu-navy bg-sgvu-navy text-white'
                        : 'border-sgvu-navy/15 bg-white text-sgvu-navy hover:border-sgvu-gold hover:bg-sgvu-gold/15',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              {view === 'subjects' ? (
                !selectedSemesterData?.courses?.length ? (
                  <StudentEmptyState
                    title="No subject grades for this semester"
                    description="Grades appear here after the semester result is published."
                    className="py-10"
                  />
                ) : (
                  <div className="space-y-3">
                    {selectedSemesterData.courses.map((course) => {
                      const meta = courseStatusMeta(course.status);
                      return (
                        <div
                          key={course.course_id}
                          className="flex flex-col gap-3 rounded-2xl border border-sgvu-navy/10 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-sgvu-navy">{course.course_name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {course.course_code} · {course.course_type} · {course.credits} credits
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="rounded-xl border border-sgvu-gold/40 bg-sgvu-gold/15 px-3 py-2 text-center shadow-sm">
                              <p className="text-[10px] uppercase tracking-wide text-sgvu-navy/70">
                                Grade points
                              </p>
                              <p className="text-lg font-black text-sgvu-navy">{formatGpa(course.grade_points)}</p>
                            </div>
                            <div className="rounded-xl bg-white px-3 py-2 text-center shadow-sm">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Grade
                              </p>
                              <p className="text-lg font-black text-sgvu-navy">
                                {course.grade || '—'}
                              </p>
                            </div>
                            <Badge className={cn('border-transparent px-3 py-1', meta.className)}>
                              {meta.label}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}

              {view === 'internals' ? (
                !selectedComponents.length ? (
                  <StudentEmptyState
                    title="No internal marks yet"
                    description="Weekly tests, assignments, and mid-terms show here after faculty publishes them."
                    className="py-10"
                  />
                ) : (
                  <StudentInternalMarksPanel subjects={selectedComponents} />
                )
              ) : null}

              {view === 'downloads' ? (
                <div className="rounded-2xl border border-sgvu-navy/10 bg-slate-50/70 p-5">
                  <p className="text-sm font-semibold text-sgvu-navy">
                    Download Semester {selectedSemester} grade card
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Provisional is temporary. Final is the official semester marksheet.
                  </p>
                  {!selectedGradeCard ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      No grade card has been published for this semester yet.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canProvisional}
                        onClick={() =>
                          selectedSemester != null &&
                          void downloadMarksheet(selectedSemester, 'provisional')
                        }
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Provisional PDF
                      </Button>
                      <Button
                        size="sm"
                        disabled={!canFinal}
                        onClick={() =>
                          selectedSemester != null && void downloadMarksheet(selectedSemester, 'final')
                        }
                        className="gap-2 border border-[#08234a] bg-[#08234a] text-white hover:bg-[#123A6D] active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
                      >
                        <Download className="h-4 w-4" />
                        Final PDF
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sgvu-gold/25 text-sgvu-navy">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-sgvu-navy">Latest exam scores</h3>
                <p className="text-xs text-muted-foreground">Recently declared by exam cell</p>
              </div>
            </div>
            {latestReports.length === 0 ? (
              <p className="rounded-xl border border-dashed border-sgvu-navy/15 bg-slate-50 px-3 py-6 text-center text-sm text-muted-foreground">
                No new exam results yet.
              </p>
            ) : (
              <div className="space-y-3">
                {latestReports.map((report) => {
                  const meta = resultStatusMeta(report.result_status);
                  return (
                    <div
                      key={report.report_id}
                      className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-sgvu-navy">
                            {report.course_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {report.course_code} · {examTypeLabel(report.exam_type)}
                          </p>
                        </div>
                        <Badge className={cn('shrink-0 border-transparent text-[10px]', meta.className)}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-bold text-sgvu-navy">
                        {report.marks_obtained}/{report.max_marks}
                        {report.grade ? (
                          <span className="ml-2 font-semibold text-muted-foreground">
                            Grade {report.grade}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl',
                  uncleared.length > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sgvu-gold/25 text-sgvu-navy',
                )}
              >
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-sgvu-navy">Subjects to clear</h3>
                <p className="text-xs text-muted-foreground">Also called backlog / ATKT</p>
              </div>
            </div>

            {uncleared.length === 0 ? (
              <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50 px-3 py-5 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-sgvu-navy" />
                <p className="mt-2 text-sm font-semibold text-sgvu-navy">You’re clear</p>
                <p className="mt-1 text-xs text-muted-foreground">No failed subjects pending.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {uncleared.map((item) => (
                  <div
                    key={item.course_id}
                    className="rounded-xl border border-destructive/20 bg-destructive/5 p-3"
                  >
                    <p className="text-sm font-semibold text-sgvu-navy">{item.course_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Sem {item.semester} · {item.course_code}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                        <Link href="/student/exams?intent=revaluation">Re-evaluation</Link>
                      </Button>
                      {isLaunchModuleEnabled('finance') ? (
                        <Button
                          size="sm"
                          className="h-8 border border-[#08234a] bg-[#08234a] text-xs text-white hover:bg-[#123A6D] active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
                          asChild
                        >
                          <Link href="/student/finance?intent=arrear">Arrear exam</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cleared.length > 0 ? (
              <div className="mt-4 border-t border-sgvu-navy/10 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cleared earlier ({cleared.length})
                </p>
                <ul className="space-y-1.5">
                  {cleared.slice(0, 4).map((item) => (
                    <li
                      key={`${item.course_code}-${item.semester}`}
                      className="text-xs text-muted-foreground"
                    >
                      Sem {item.semester}: {item.course_name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </StudentPageShell>
  );
}
