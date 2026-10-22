'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

type UfmCase = {
  case_id: string;
  student_name: string;
  description: string;
  penalty_applied: string;
  status: string;
  marks_locked: boolean;
  exam_type?: string;
  logged_at: string;
  course_scope?: string;
};

type StudentOption = {
  user_id: string;
  name: string;
  official_email: string;
  enrollment_number: string | null;
  prn_number?: string | null;
  abc_id?: string | null;
  department?: string;
};

type CourseOption = {
  course_id: string;
  course_code: string;
  course_name: string;
  semester?: number;
};

type LookupType = 'ENROLLMENT' | 'EMAIL' | 'SID';
type FormOptions = { students: StudentOption[]; courses: CourseOption[]; departments: string[] };
type OptionsResult = { api: ReturnType<typeof useAuthedApi>; key: string; data: FormOptions; error: string | null };
type CasesResult = { api: ReturnType<typeof useAuthedApi>; key: string; data: UfmCase[]; error: string | null };

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

export default function ExamCellUfmPage() {
  const api = useAuthedApi();
  const now = new Date();
  const [optionsResult, setOptionsResult] = useState<OptionsResult | null>(null);
  const [casesResult, setCasesResult] = useState<CasesResult | null>(null);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [casesRetry, setCasesRetry] = useState(0);
  const [semester, setSemester] = useState('4');
  const [department, setDepartment] = useState('');
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState('');
  const [lookupType, setLookupType] = useState<LookupType>('ENROLLMENT');
  const [form, setForm] = useState({
    student_pick: '',
    student_ref: '',
    description: '',
    penalty_applied: 'Exam cancelled — UFM',
    course_id: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const optionsKey = `${semester}:${department}:${optionsRetry}`;
  const casesKey = `${filterYear}:${filterMonth}:${casesRetry}`;
  const currentOptions = optionsResult?.api === api && optionsResult.key === optionsKey ? optionsResult : null;
  const currentCases = casesResult?.api === api && casesResult.key === casesKey ? casesResult : null;
  const loadingOptions = !currentOptions;
  const optionsError = currentOptions?.error;
  const students = currentOptions?.data.students ?? [];
  const courses = currentOptions?.data.courses ?? [];
  const departments = currentOptions?.data.departments ?? [];
  const cases = currentCases?.data ?? [];
  const loadingCases = !currentCases;
  const casesError = currentCases?.error;
  const courseSelectionInvalid = Boolean(form.course_id) && !courses.some((course) => course.course_id === form.course_id);
  const selectedStudent = students.some((student) => student.user_id === form.student_pick) ? form.student_pick : '';

  useEffect(() => {
    let current = true;
    const qs = new URLSearchParams({ semester });
    if (department) qs.set('department', department);
    void api.get<FormOptions>(`/api/exam-cell/ufm-cases/form-options?${qs}`)
      .then((options) => {
        if (current) setOptionsResult({ api, key: optionsKey, data: { students: options.students ?? [], courses: options.courses ?? [], departments: options.departments ?? [] }, error: null });
      })
      .catch((error: unknown) => {
        if (current) setOptionsResult({ api, key: optionsKey, data: { students: [], courses: [], departments: [] }, error: error instanceof Error ? error.message : 'Could not load student and course options' });
      });
    return () => { current = false; };
  }, [api, semester, department, optionsKey]);

  useEffect(() => {
    let current = true;
    const qs = new URLSearchParams();
    if (filterYear) qs.set('year', filterYear);
    if (filterMonth) qs.set('month', filterMonth);
    const suffix = qs.toString() ? `?${qs}` : '';
    void api.get<UfmCase[]>(`/api/exam-cell/ufm-cases${suffix}`)
      .then((data) => {
        if (current) setCasesResult({ api, key: casesKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (current) setCasesResult({ api, key: casesKey, data: [], error: error instanceof Error ? error.message : 'Could not load UFM case history' });
      });
    return () => { current = false; };
  }, [api, filterYear, filterMonth, casesKey]);

  const lookupPlaceholder = useMemo(() => {
    if (lookupType === 'EMAIL') return 'student@sgvu.edu.in';
    if (lookupType === 'SID') return 'Student user ID (UUID)';
    return 'e.g. SGVU2022CSE001';
  }, [lookupType]);

  async function logCase() {
    if (submissionPending.current || loadingOptions || optionsError || courseSelectionInvalid) return;
    const studentRef = form.student_ref.trim() || selectedStudent;
    if (!studentRef) {
      toast.error('Select a student or enter their identifier');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Enter an incident description');
      return;
    }
    const courseCode = courses.find((c) => c.course_id === form.course_id)?.course_code;
    submissionPending.current = true;
    setSubmitting(true);
    try {
      await api.post('/api/exam-cell/ufm-cases', {
        student_user_id: studentRef,
        description: form.description.trim(),
        penalty_applied: form.penalty_applied.trim() || undefined,
        course_id: form.course_id.trim() || undefined,
      });
      toast.success(
        courseCode
          ? `UFM logged for ${courseCode} — marks zeroed & grade card withheld`
          : 'UFM logged — marks zeroed & grade card withheld',
      );
      setForm({ student_pick: '', student_ref: '', description: '', penalty_applied: 'Exam cancelled — UFM', course_id: '' });
      setCasesRetry((retry) => retry + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to log UFM case');
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  const tableColumns = useMemo<DataTableColumn<UfmCase>[]>(
    () => [
      {
        key: 'student',
        header: 'Student',
        render: (c) => (
          <div>
            <p className="font-semibold text-sgvu-navy">{c.student_name ?? 'Student'}</p>
            <p className="text-xs text-muted-foreground">{new Date(c.logged_at).toLocaleString('en-IN')}</p>
          </div>
        ),
      },
      {
        key: 'incident',
        header: 'Incident',
        render: (c) => <p className="max-w-xs text-sm">{c.description}</p>,
      },
      {
        key: 'status',
        header: 'Case Status',
        render: (c) => {
          const s = c.status.toUpperCase();
          const variant = s === 'CLOSED' ? 'secondary' : s === 'UNDER_REVIEW' ? 'warning' : 'destructive';
          return <Badge variant={variant}>{c.status}</Badge>;
        },
      },
      {
        key: 'automation',
        header: 'Automated System Action',
        render: (c) => {
          const subject = c.exam_type ?? c.course_scope ?? 'All subjects';
          return (
            <div className="space-y-1">
              <p className="text-sm font-medium text-sgvu-navy">
                Marks locked to 0 for {subject}
              </p>
              <p className="text-xs text-muted-foreground">Student grade card set to WITHHELD (UFM)</p>
            </div>
          );
        },
      },
    ],
    [],
  );

  const fieldClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const labelClass = 'text-xs font-bold uppercase tracking-wide text-sgvu-navy/55';
  const btnPrimary =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader
            pageId="ufm-cases"
            subtitle="Step 1: Select semester → Step 2: Pick department & student → Step 3: Choose course scope → Log case."
          />
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="border-b border-sgvu-navy/10 pb-4">
            <h2 className="text-lg font-bold text-sgvu-navy">Log new UFM case</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Filter the roster, identify the student, then record the incident and penalty.
            </p>
          </div>

          {loadingOptions && <p role="status" className="text-sm text-muted-foreground">Loading student and course options…</p>}
          {optionsError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p>Could not load student and course options: {optionsError}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setOptionsRetry((retry) => retry + 1)}>Retry form options</Button>
            </div>
          )}
          {!loadingOptions && courseSelectionInvalid && <p role="alert" className="text-sm text-red-900">The selected course is no longer available. Choose a course scope before logging a case.</p>}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>1. Semester</label>
              <Select aria-label="UFM semester" disabled={submitting} className={fieldClass} value={semester} onChange={(e) => {
                setSemester(e.target.value);
                setDepartment('');
                setForm((current) => ({ ...current, student_pick: '', course_id: '' }));
              }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>
                    Semester {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>2. Department</label>
              <Select
                aria-label="UFM department"
                disabled={submitting || loadingOptions || Boolean(optionsError)}
                className={fieldClass}
                value={department || 'ALL'}
                onChange={(e) => {
                  setDepartment(e.target.value === 'ALL' ? '' : e.target.value);
                  setForm((current) => ({ ...current, student_pick: '', course_id: '' }));
                }}
              >
                <option value="ALL">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>3. Course (optional)</label>
              <Select
                aria-label="UFM course scope"
                disabled={submitting || loadingOptions || Boolean(optionsError)}
                className={fieldClass}
                value={courseSelectionInvalid ? '' : form.course_id || 'ALL'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, course_id: e.target.value === 'ALL' ? '' : e.target.value }))
                }
              >
                {courseSelectionInvalid && <option value="">Choose course scope</option>}
                <option value="ALL">All courses — zero all marks</option>
                {courses.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_code} — {c.course_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Student (from filtered list)</label>
              <Select
                aria-label="UFM student"
                disabled={submitting || loadingOptions || Boolean(optionsError)}
                className={fieldClass}
                value={selectedStudent || undefined}
                placeholder="Select student…"
                onChange={(e) => setForm((f) => ({ ...f, student_pick: e.target.value, student_ref: '' }))}
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
                    {s.enrollment_number ? ` · ${s.enrollment_number}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Or look up by identifier</label>
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <Select
                  aria-label="UFM identifier type"
                  disabled={submitting}
                  className={fieldClass}
                  value={lookupType}
                  onChange={(e) => setLookupType(e.target.value as LookupType)}
                >
                  <option value="ENROLLMENT">Enrollment</option>
                  <option value="EMAIL">Email</option>
                  <option value="SID">Student ID</option>
                </Select>
                <Input
                  aria-label="UFM student identifier"
                  disabled={submitting}
                  className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                  placeholder={lookupPlaceholder}
                  value={form.student_ref}
                  onChange={(e) => setForm((f) => ({ ...f, student_ref: e.target.value, student_pick: '' }))}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className={labelClass}>Incident description</label>
              <textarea
                aria-label="UFM incident description"
                disabled={submitting}
                className="min-h-[96px] w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 py-2.5 text-sm text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25"
                placeholder="Describe what happened during the exam…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className={labelClass}>Penalty</label>
              <Input
                aria-label="UFM penalty"
                disabled={submitting}
                className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                placeholder="Exam cancelled — UFM"
                value={form.penalty_applied}
                onChange={(e) => setForm((f) => ({ ...f, penalty_applied: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-center border-t border-sgvu-navy/10 pt-4">
            <Button
              variant="outline"
              className={btnPrimary}
              onClick={() => void logCase()}
              disabled={submitting || loadingOptions || Boolean(optionsError) || courseSelectionInvalid}
            >
              {submitting ? 'Logging UFM…' : 'Log UFM & trigger auto-penalties'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">UFM case history</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Default: last 1 month. Filter by year and month for older records.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Year</label>
                <Select aria-label="UFM history year" className={`${fieldClass} w-[7.5rem]`} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                  {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Period</label>
                <Select
                  aria-label="UFM history period"
                  className={`${fieldClass} w-[11rem]`}
                  value={filterMonth || 'RECENT'}
                  onChange={(e) => setFilterMonth(e.target.value === 'RECENT' ? '' : e.target.value)}
                >
                  <option value="RECENT">Last 1 month</option>
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {loadingCases ? (
            <div role="status" className="rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-10 text-center text-sm text-muted-foreground">
              Loading case history…
            </div>
          ) : casesError ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p>Could not load UFM case history: {casesError}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setCasesRetry((retry) => retry + 1)}>Retry case history</Button>
            </div>
          ) : cases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-10 text-center text-sm text-muted-foreground">
              No UFM cases in this period.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-sgvu-navy/10">
              <DataTable
                columns={tableColumns}
                rows={cases}
                rowKey={(c) => c.case_id}
                emptyMessage="No UFM cases in this period."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
