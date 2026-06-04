'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { API_URL } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  backlogs: {
    uncleared: { course_id: string; course_code: string; course_name: string }[];
    cleared: { course_code: string; course_name: string }[];
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
      .catch(() => setData(null))
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

  async function downloadMarksheet(semester: number) {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/academics/marksheet/download/${semester}`, {
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
      a.download = `marksheet-semester-${semester}.pdf`;
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

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Marks & Grade Cards"
        description="Semester-wise grade history, continuous assessment (CAT / DA), and backlog (ATKT) status — VTOP-style."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cumulative performance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">CGPA</p>
            <p className="text-4xl font-black text-sgvu-navy">{loading ? '—' : data?.cgpa?.toFixed(2) ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Credits earned</p>
            <p className="text-4xl font-black text-sgvu-navy">{loading ? '—' : data?.total_credits_earned ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade history</CardTitle>
          <p className="text-sm text-muted-foreground">Expand a semester to view subject-wise grades and download the provisional marksheet.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading grade history…</p>}
          {!loading && !data?.semesters?.length && (
            <p className="text-sm text-muted-foreground">No semester results on record yet.</p>
          )}
          {(data?.semesters ?? []).map((sem) => {
            const open = expandedSemesters.has(sem.semester_number);
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void downloadMarksheet(sem.semester_number)}
                    >
                      <Download className="h-4 w-4" />
                      Download Provisional Marksheet (PDF)
                    </Button>
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
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={componentSemester ?? ''}
                onChange={(e) => setComponentSemester(Number(e.target.value))}
              >
                {semesterOptions.map((n) => (
                  <option key={n} value={n}>
                    Semester {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {!componentSemesterData?.subjects?.length && (
            <p className="text-sm text-muted-foreground">
              No subjects for this semester, or marks have not been published yet.
            </p>
          )}
          {(componentSemesterData?.subjects ?? []).map((sub) => {
            const open = expandedSubjects.has(sub.course_id);
            const hasComponents = sub.components.length > 0;
            return (
              <div key={sub.course_id} className="overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => toggleSubject(sub.course_id)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-muted/40"
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{sub.course_code}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="font-medium">{sub.course_name}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {hasComponents && (
                      <span className="font-semibold text-foreground">
                        Internal: {sub.total_internal_obtained}/{sub.total_internal_max}
                      </span>
                    )}
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-border px-4 pb-4">
                    {!hasComponents ? (
                      <p className="pt-3 text-sm text-muted-foreground">
                        Published component marks will appear here once faculty releases them.
                      </p>
                    ) : (
                      <table className="mt-3 w-full text-sm">
                        <tbody>
                          {sub.components.map((c) => (
                            <tr key={c.key} className="border-b border-border/50 last:border-0">
                              <td className="py-2 text-muted-foreground">{c.label}</td>
                              <td className="py-2 text-right font-medium tabular-nums">
                                {c.marks_obtained}/{c.max_marks}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold">
                            <td className="pt-3">Total Internal Marks</td>
                            <td className="pt-3 text-right tabular-nums">
                              {sub.total_internal_obtained}/{sub.total_internal_max}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backlog (ATKT)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="mb-2 font-medium">
              Uncleared: {(data?.backlogs?.uncleared ?? []).length}
            </p>
            {(data?.backlogs?.uncleared ?? []).length === 0 && (
              <p className="text-muted-foreground">No active backlogs — you are clear for progression.</p>
            )}
            <ul className="space-y-2">
              {(data?.backlogs?.uncleared ?? []).map((b) => (
                <li key={b.course_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-destructive">
                    {b.course_code} — {b.course_name}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/student/exams?intent=revaluation">Apply for Re-evaluation</Link>
                    </Button>
                    <Button size="sm" variant="default" asChild>
                      <Link href="/student/finance?intent=arrear">Register for Arrear Exam</Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium text-emerald-700">
              Cleared: {(data?.backlogs?.cleared ?? []).length}
            </p>
            {(data?.backlogs?.cleared ?? []).map((b) => (
              <p key={b.course_code} className="text-muted-foreground">
                {b.course_code} — {b.course_name}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
