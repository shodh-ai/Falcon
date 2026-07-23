'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import { isLaunchModuleEnabled } from '@/lib/launch-modules';

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

type MarksHistory = {
  cgpa: number;
  total_credits_earned: number;
  semesters: SemesterRow[];
  component_marks_by_semester: { semester_number: number; subjects: ComponentSubject[] }[];
  exam_reports?: Array<{
    report_id: string;
    session_id: string;
    course_code: string;
    course_name: string;
    exam_type: string;
    marks_obtained: string | number;
    max_marks: string | number;
    percent: string | number | null;
    grade: string | null;
    result_status: string;
    report_summary: string | null;
    declaration_note?: string | null;
    declared_at: string;
  }>;
  grade_cards?: Array<{
    grade_card_id: string;
    semester: number;
    status: 'DRAFT' | 'PUBLISHED' | 'WITHHELD';
    published_at: string | null;
    payload: {
      result_stage?: 'DRAFT' | 'PROVISIONAL' | 'FINAL';
      sgpa?: number;
      cgpa?: number;
      rank?: number | null;
      credits_attempted?: number;
      credits_earned?: number;
      withheld_reason?: string;
    } | null;
  }>;
  backlogs: {
    uncleared: { course_id: string; course_code: string; course_name: string; semester: number }[];
    cleared: { course_code: string; course_name: string; semester: number }[];
  };
};

function statusBadgeClass(status: string) {
  if (status === 'PASS') return 'text-emerald-700';
  if (status === 'FAIL') return 'text-destructive font-semibold';
  return 'text-muted-foreground';
}

export default function StudentMarksPage() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [data, setData] = useState<MarksHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSemesters, setExpandedSemesters] = useState<Set<number>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [componentSemester, setComponentSemester] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    void api
      .get<MarksHistory>('/api/academics/marks/history')
      .then((payload) => {
        setData(payload);
        const latest = payload.semesters.at(-1)?.semester_number ?? payload.component_marks_by_semester.at(-1)?.semester_number ?? 1;
        setComponentSemester(latest);
        if (payload.semesters.length) {
          setExpandedSemesters(new Set([payload.semesters[payload.semesters.length - 1].semester_number]));
        }
      })
      .catch((e) => {
        setData(null);
        toast.error(e instanceof Error ? e.message : 'Could not load marks history');
      })
      .finally(() => setLoading(false));
  }, [api]);

  const componentSemesterData = useMemo(() => {
    if (!data || componentSemester == null) return null;
    return data.component_marks_by_semester.find((s) => s.semester_number === componentSemester) ?? null;
  }, [data, componentSemester]);

  const semesterOptions = useMemo(() => {
    const fromGrades = data?.semesters.map((s) => s.semester_number) ?? [];
    const fromComponents = data?.component_marks_by_semester.map((s) => s.semester_number) ?? [];
    return [...new Set([...fromGrades, ...fromComponents])].sort((a, b) => a - b);
  }, [data]);

  const gradeCardsBySemester = useMemo(() => {
    const map = new Map<number, NonNullable<MarksHistory['grade_cards']>[number]>();
    for (const card of data?.grade_cards ?? []) {
      if (!map.has(Number(card.semester))) map.set(Number(card.semester), card);
    }
    return map;
  }, [data?.grade_cards]);

  async function downloadMarksheet(semester: number, type: 'provisional' | 'final') {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/academics/marksheet/download/${semester}?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  function toggleSemester(sem: number) {
    setExpandedSemesters((prev) => {
      const next = new Set(prev);
      if (next.has(sem)) next.delete(sem);
      else next.add(sem);
      return next;
    });
  }

  function toggleSubject(courseId: string) {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  if (loading && !data) {
    return <StudentLoadingState label="Loading grade history…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Marks & Grade Cards"
        description="Semester-wise grade history, continuous assessment (CAT / DA), and backlog (ATKT) status — VTOP-style."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StudentStatCard label="CGPA" value={data?.cgpa?.toFixed(2) ?? '—'} helper="Cumulative grade point average" tone="gold" />
        <StudentStatCard label="Credits earned" value={data?.total_credits_earned ?? '—'} helper="Total credits completed" />
      </div>

      {(data?.grade_cards?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Published marksheets</CardTitle>
            <p className="text-sm text-muted-foreground">
              Provisional and final semester grade cards published by the Controller of Examinations.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {data!.grade_cards!.map((card) => {
              const stage = card.payload?.result_stage ?? 'DRAFT';
              const isFinal = stage === 'FINAL';
              const isPublished = stage === 'PROVISIONAL' || isFinal;
              return (
                <div key={card.grade_card_id} className="rounded-xl border p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sgvu-navy">Semester {card.semester}</p>
                      <p className="text-muted-foreground">
                        SGPA {Number(card.payload?.sgpa ?? 0).toFixed(2)} · CGPA {Number(card.payload?.cgpa ?? data?.cgpa ?? 0).toFixed(2)}
                      </p>
                      {card.payload?.rank ? <p className="text-xs text-muted-foreground">Semester rank #{card.payload.rank}</p> : null}
                      {card.payload?.withheld_reason ? (
                        <p className="text-xs text-destructive">{card.payload.withheld_reason}</p>
                      ) : null}
                    </div>
                    <Badge variant={card.status === 'WITHHELD' ? 'destructive' : isFinal ? 'success' : 'warning'}>
                      {card.status === 'WITHHELD' ? 'Withheld' : isFinal ? 'Final' : stage === 'PROVISIONAL' ? 'Provisional' : 'Draft'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isPublished || card.status === 'WITHHELD'}
                      onClick={() => void downloadMarksheet(Number(card.semester), 'provisional')}
                    >
                      <Download className="h-4 w-4" /> Provisional PDF
                    </Button>
                    <Button
                      size="sm"
                      disabled={!isFinal || card.status === 'WITHHELD'}
                      onClick={() => void downloadMarksheet(Number(card.semester), 'final')}
                    >
                      <Download className="h-4 w-4" /> Final PDF
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {(data?.exam_reports?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Declared exam reports</CardTitle>
            <p className="text-sm text-muted-foreground">Individual result reports published by Exam Cell after declaration.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data!.exam_reports!.map((report) => (
              <div key={report.report_id} className="rounded-xl border border-green-200 bg-green-50/60 p-4 text-sm">
                <p className="font-semibold text-sgvu-navy">
                  {report.course_name} ({report.course_code}) · {report.exam_type.replace('_', ' ')}
                </p>
                <p className="mt-1">
                  Marks: {report.marks_obtained}/{report.max_marks}
                  {report.percent != null ? ` (${report.percent}%)` : ''}
                  {report.grade ? ` · Grade ${report.grade}` : ''}
                  {' · '}
                  {report.result_status}
                </p>
                {report.report_summary ? <p className="mt-2 text-muted-foreground">{report.report_summary}</p> : null}
                {report.declaration_note ? <p className="mt-1 text-xs text-muted-foreground">{report.declaration_note}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">Declared {String(report.declared_at).slice(0, 10)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade history</CardTitle>
          <p className="text-sm text-muted-foreground">Expand a semester to view subject-wise grades and download available marksheets.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading grade history…</p>}
          {!loading && !data?.semesters?.length && (
            <p className="text-sm text-muted-foreground">No semester results on record yet.</p>
          )}
          {(data?.semesters ?? []).map((sem) => {
            const open = expandedSemesters.has(sem.semester_number);
            const card = gradeCardsBySemester.get(sem.semester_number);
            const stage = card?.payload?.result_stage ?? 'DRAFT';
            const canDownloadProvisional = !card || (card && card.status !== 'WITHHELD' && stage !== 'DRAFT');
            const canDownloadFinal = !card || (card && card.status !== 'WITHHELD' && stage !== 'DRAFT');
            return (
              <div key={sem.semester_number} className="overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => toggleSemester(sem.semester_number)}
                  className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left text-sm font-medium hover:bg-muted/60"
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Semester {sem.semester_number}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">Total Credits: {sem.credits}</span>
                    <span className="text-muted-foreground">|</span>
                    <span>SGPA: {sem.sgpa.toFixed(2)}</span>
                    {card ? (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <Badge variant={card.status === 'WITHHELD' ? 'destructive' : stage === 'FINAL' ? 'success' : 'warning'}>
                          {card.status === 'WITHHELD' ? 'Withheld' : stage}
                        </Badge>
                      </>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {open ? 'Collapse' : 'Expand'}
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                </button>
                {open && (
                  <div className="space-y-4 border-t border-border p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">Course Code</th>
                            <th className="py-2 pr-3 font-medium">Course Title</th>
                            <th className="py-2 pr-3 font-medium">Course Type</th>
                            <th className="py-2 pr-3 font-medium">Credits</th>
                            <th className="py-2 pr-3 font-medium">Grade</th>
                            <th className="py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sem.courses.map((c) => (
                            <tr key={c.course_id} className="border-b border-border/60 last:border-0">
                              <td className="py-2.5 pr-3 font-mono text-xs">{c.course_code}</td>
                              <td className="py-2.5 pr-3">{c.course_name}</td>
                              <td className="py-2.5 pr-3">{c.course_type}</td>
                              <td className="py-2.5 pr-3">{c.credits}</td>
                              <td className="py-2.5 pr-3 font-semibold">{c.grade}</td>
                              <td className={cn('py-2.5', statusBadgeClass(c.status))}>
                                {c.status === 'PASS' ? 'Pass' : c.status === 'FAIL' ? 'Fail' : 'In progress'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={!canDownloadProvisional}
                        onClick={() => void downloadMarksheet(sem.semester_number, 'provisional')}
                      >
                        <Download className="h-4 w-4" />
                        Download Provisional PDF
                      </Button>
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={!canDownloadFinal}
                        onClick={() => void downloadMarksheet(sem.semester_number, 'final')}
                      >
                        <Download className="h-4 w-4" />
                        Download Final PDF
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Component marks</CardTitle>
            <p className="text-sm text-muted-foreground">Continuous assessment — DA, CAT, and internal totals per subject.</p>
          </div>
          {semesterOptions.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Semester</span>
              <Select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={componentSemester ?? ''}
                onChange={(e) => setComponentSemester(Number(e.target.value))}
              >
                {semesterOptions.map((n) => (
                  <option key={n} value={n}>
                    Semester {n}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!componentSemesterData?.subjects?.length ? (
            <p className="text-sm text-muted-foreground px-4 py-4 text-center">
              No subjects for this semester, or marks have not been published yet. Faculty must click
              &ldquo;Publish to students&rdquo; after saving draft marks — draft marks are not visible here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Subject</th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">WT1<br/><span className="text-[10px] opacity-70">(Max 10)</span></th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">WT2<br/><span className="text-[10px] opacity-70">(Max 10)</span></th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">GA1<br/><span className="text-[10px] opacity-70">(Max 5)</span></th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">GA2<br/><span className="text-[10px] opacity-70">(Max 5)</span></th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">MTE1<br/><span className="text-[10px] opacity-70">(Max 15)</span></th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">MTE2<br/><span className="text-[10px] opacity-70">(Max 15)</span></th>
                    <th className="px-4 py-3 text-center font-medium whitespace-nowrap">ETE<br/><span className="text-[10px] opacity-70">(Max 40)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {componentSemesterData.subjects.map((sub) => {
                    const getMark = (type: string) => sub.components.find((c) => c.key.startsWith(type));
                    return (
                      <tr key={sub.course_id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-sgvu-navy">{sub.course_code}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{sub.course_name}</div>
                        </td>
                        {['WT1', 'WT2', 'GA1', 'GA2', 'MTE1', 'MTE2', 'ETE'].map((type) => {
                          const mark = getMark(type);
                          return (
                            <td key={type} className="px-4 py-4 text-center tabular-nums">
                              {mark ? (
                                <span className="font-medium text-foreground">{mark.marks_obtained}</span>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backlog (ATKT)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div>
            <p className="mb-3 font-medium">
              Uncleared: {(data?.backlogs?.uncleared ?? []).length}
            </p>
            {(data?.backlogs?.uncleared ?? []).length === 0 ? (
              <p className="text-muted-foreground">No active backlogs — you are clear for progression.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Semester</th>
                      <th className="py-2 pr-3 font-medium">Course Code</th>
                      <th className="py-2 pr-3 font-medium">Subject Name</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.backlogs?.uncleared ?? []).map((b) => (
                      <tr key={b.course_id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-3 font-semibold">Sem {b.semester}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-destructive">{b.course_code}</td>
                        <td className="py-2.5 pr-3 text-destructive">{b.course_name}</td>
                        <td className="py-2.5">
                          <span className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href="/student/exams?intent=revaluation">Re-evaluation</Link>
                            </Button>
                            {isLaunchModuleEnabled('finance') && (
                              <Button size="sm" variant="default" asChild>
                                <Link href="/student/finance?intent=arrear">Arrear Exam</Link>
                              </Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <p className="mb-3 font-medium text-emerald-700">
              Cleared: {(data?.backlogs?.cleared ?? []).length}
            </p>
            {(data?.backlogs?.cleared ?? []).length === 0 ? (
              <p className="text-muted-foreground">No previously cleared backlogs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Semester</th>
                      <th className="py-2 pr-3 font-medium">Course Code</th>
                      <th className="py-2 font-medium">Subject Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.backlogs?.cleared ?? []).map((b) => (
                      <tr key={`${b.course_code}-${b.semester}`} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-3 font-semibold">Sem {b.semester}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{b.course_code}</td>
                        <td className="py-2.5 text-muted-foreground">{b.course_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </StudentPageShell>
  );
}
