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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';
import { DEMO_MARKS } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

type CourseRow = {
  course_id: string;
  course_code: string;
  course_name: string;
  course_type: string;
  credits: number;
  grade: string;
  status: string;
};

type SemesterRow = {
  semester_number: number;
  sgpa: number;
  credits: number;
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
  cgpa: number;
  total_credits_earned: number;
  semesters: SemesterRow[];
  component_marks_by_semester: { semester_number: number; subjects: ComponentSubject[] }[];
  exam_reports?: ExamReport[];
  grade_cards?: GradeCard[];
  backlogs: {
    uncleared: { course_id: string; course_code: string; course_name: string; semester: number }[];
    cleared: { course_code: string; course_name: string; semester: number }[];
  };
};

const COMPONENT_COLUMNS = [
  { key: 'WT1', label: 'Weekly 1', max: 5, aliases: ['WT1'] },
  { key: 'WT2', label: 'Weekly 2', max: 5, aliases: ['WT2'] },
  { key: 'GA1', label: 'Assign 1', max: 5, aliases: ['GA1'] },
  { key: 'GA2', label: 'Assign 2', max: 5, aliases: ['GA2'] },
  { key: 'MT1', label: 'Mid 1', max: 10, aliases: ['MT1', 'MTE1'] },
  { key: 'MT2', label: 'Mid 2', max: 10, aliases: ['MT2', 'MTE2'] },
  { key: 'ETE', label: 'End term', max: 40, aliases: ['ETE', 'END_TERM'] },
] as const;

function findComponentMark(
  components: ComponentSubject['components'],
  aliases: readonly string[],
) {
  return components.find((c) =>
    aliases.some((alias) => c.key.toUpperCase().startsWith(alias)),
  );
}

function weeklyMarksSummary(components: ComponentSubject['components'] | undefined) {
  if (!components?.length) {
    return { obtained: null as number | null, max: 10, label: '—' };
  }
  const wt1 = findComponentMark(components, ['WT1']);
  const wt2 = findComponentMark(components, ['WT2']);
  const parts = [wt1, wt2].filter(Boolean);
  if (!parts.length) {
    return { obtained: null as number | null, max: 10, label: '—' };
  }
  const obtained = parts.reduce((sum, part) => sum + Number(part!.marks_obtained ?? 0), 0);
  const max = parts.reduce((sum, part) => sum + Number(part!.max_marks ?? 5), 0) || 10;
  return { obtained, max, label: `${obtained}/${max}` };
}

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
  if (stage === 'FINAL') {
    return { label: 'Final', className: 'bg-sgvu-navy text-white', hint: 'Official final card' };
  }
  if (stage === 'PROVISIONAL') {
    return { label: 'Provisional', className: 'bg-sgvu-gold text-sgvu-navy', hint: 'Temporary result' };
  }
  return { label: 'Upcoming', className: 'bg-white text-sgvu-navy border border-sgvu-navy/20', hint: 'Not published yet' };
}

function examTypeLabel(examType: string) {
  return examType
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StudentMarksWorkspace() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [data, setData] = useState<MarksHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [view, setView] = useState<'subjects' | 'internals' | 'downloads'>('subjects');

  useEffect(() => {
    setLoading(true);
    void api
      .get<MarksHistory>('/api/academics/marks/history')
      .then((payload) => {
        const useDemo = !payload?.semesters?.length && isStudentDemoModeEnabled();
        const next = useDemo ? (DEMO_MARKS as MarksHistory) : payload;
        setData(next);
        const latest =
          next.semesters.at(-1)?.semester_number ??
          next.component_marks_by_semester.at(-1)?.semester_number ??
          next.grade_cards?.at(-1)?.semester ??
          null;
        setSelectedSemester(latest != null ? Number(latest) : null);
      })
      .catch(() => {
        if (isStudentDemoModeEnabled()) {
          setData(DEMO_MARKS as MarksHistory);
          setSelectedSemester(5);
        } else {
          setData(null);
          setSelectedSemester(null);
        }
      })
      .finally(() => setLoading(false));
  }, [api]);

  const semesterNumbers = [1, 2, 3, 4, 5, 6, 7, 8] as const;

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

  const componentsByCourseId = useMemo(() => {
    const map = new Map<string, ComponentSubject>();
    for (const subject of selectedComponents) {
      map.set(subject.course_id, subject);
    }
    return map;
  }, [selectedComponents]);

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

  const stage = selectedGradeCard?.payload?.result_stage ?? 'DRAFT';
  const stageMeta = cardStageMeta(selectedGradeCard?.status ?? 'DRAFT', stage);
  const canProvisional =
    !!selectedGradeCard &&
    selectedGradeCard.status !== 'WITHHELD' &&
    (stage === 'PROVISIONAL' || stage === 'FINAL');
  const canFinal =
    !!selectedGradeCard && selectedGradeCard.status !== 'WITHHELD' && stage === 'FINAL';
  const sgpa =
    selectedSemesterData?.sgpa ??
    Number(selectedGradeCard?.payload?.sgpa ?? 0);

  return (
    <StudentPageShell width="full" className="max-w-[1400px]">
      <StudentPageHeader
        title="Results"
        description="One place to check your overall GPA, pick a semester, and see subject grades, internal marks, and downloads."
        eyebrow="Academic scorecard"
      />

      {/* Score hero */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-sgvu-navy/10 bg-[#08234a] text-white shadow-sm">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sgvu-gold/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
        <div className="relative grid gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-[1.2fr_1fr_1fr] md:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">Overall CGPA</p>
            <p className="mt-2 text-5xl font-black tracking-tight sm:text-6xl">
              {data?.cgpa != null ? data.cgpa.toFixed(2) : '—'}
            </p>
            <p className="mt-2 max-w-sm text-sm text-white/70">
              Your average grade across completed semesters. Higher is better.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sgvu-gold">
              <Award className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Credits earned</p>
            </div>
            <p className="mt-3 text-3xl font-black">{data?.total_credits_earned ?? '—'}</p>
            <p className="mt-1 text-sm text-white/65">Credits completed so far in your program</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sgvu-gold">
              {uncleared.length === 0 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Subjects to clear</p>
            </div>
            <p className="mt-3 text-3xl font-black">{uncleared.length}</p>
            <p className="mt-1 text-sm text-white/65">
              {uncleared.length === 0
                ? 'No failed papers pending — you are clear'
                : 'Failed papers that still need to be cleared'}
            </p>
          </div>
        </div>
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
                Choose any semester from 1 to 8. Semesters with results are solid; others are upcoming.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:overflow-x-auto sm:pb-1">
              {semesterNumbers.map((n) => {
                const active = n === selectedSemester;
                const hasData = semestersWithData.has(n);
                return (
                  <button
                    key={n}
                    type="button"
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
                    <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      Sem
                    </span>
                    <span className="block text-lg font-black leading-none">{n}</span>
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
                  <p className="text-[11px] text-muted-foreground">Semester GPA</p>
                  <p className="text-xl font-black text-sgvu-navy">
                    {selectedSemesterData || selectedGradeCard ? sgpa.toFixed(2) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Credits this sem</p>
                  <p className="text-xl font-black text-sgvu-navy">
                    {selectedSemesterData?.credits ?? '—'}
                  </p>
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
                      const weekly = weeklyMarksSummary(
                        componentsByCourseId.get(course.course_id)?.components,
                      );
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
                                Weekly marks
                              </p>
                              <p className="text-lg font-black text-sgvu-navy">{weekly.label}</p>
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
                  <div className="space-y-4">
                    {selectedComponents.map((sub) => {
                      const weekly = weeklyMarksSummary(sub.components);
                      return (
                        <div
                          key={sub.course_id}
                          className="rounded-2xl border border-sgvu-navy/10 bg-white p-4"
                        >
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-sgvu-navy">{sub.course_name}</p>
                              <p className="text-xs text-muted-foreground">{sub.course_code}</p>
                            </div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Internal total:{' '}
                              <span className="font-bold text-sgvu-navy">
                                {sub.total_internal_obtained}/{sub.total_internal_max}
                              </span>
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                            <div className="rounded-xl border border-sgvu-gold/50 bg-sgvu-gold/20 px-2.5 py-2 text-center">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-sgvu-navy/80">
                                Weekly total
                              </p>
                              <p className="mt-1 text-sm font-bold text-sgvu-navy">
                                {weekly.obtained == null ? '—' : weekly.obtained}
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  /{weekly.max}
                                </span>
                              </p>
                            </div>
                            {COMPONENT_COLUMNS.map((col) => {
                              const mark = findComponentMark(sub.components, col.aliases);
                              return (
                                <div
                                  key={col.key}
                                  className="rounded-xl border border-sgvu-navy/10 bg-slate-50 px-2.5 py-2 text-center"
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {col.label}
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-sgvu-navy">
                                    {mark ? mark.marks_obtained : '—'}
                                    <span className="text-[10px] font-normal text-muted-foreground">
                                      /{col.max}
                                    </span>
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                          <p className="truncate text-sm font-semibold text-sgvu-navy">
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
