'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';

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

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

export default function ExamCellUfmPage() {
  const api = useAuthedApi();
  const now = new Date();
  const [cases, setCases] = useState<UfmCase[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
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
  const [loadingCases, setLoadingCases] = useState(true);

  const loadOptions = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ semester });
      if (department) qs.set('department', department);
      const options = await api.get<{ students: StudentOption[]; courses: CourseOption[]; departments: string[] }>(
        `/api/exam-cell/ufm-cases/form-options?${qs}`,
      );
      setStudents(options.students ?? []);
      setCourses(options.courses ?? []);
      setDepartments(options.departments ?? []);
      setForm((f) => ({
        ...f,
        student_pick: options.students?.some((s) => s.user_id === f.student_pick) ? f.student_pick : '',
        course_id: options.courses?.some((c) => c.course_id === f.course_id) ? f.course_id : '',
      }));
    } catch {
      setStudents([]);
      setCourses([]);
      setDepartments([]);
    }
  }, [api, semester, department]);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const qs = new URLSearchParams();
      if (filterYear) qs.set('year', filterYear);
      if (filterMonth) qs.set('month', filterMonth);
      const suffix = qs.toString() ? `?${qs}` : '';
      setCases(await api.get<UfmCase[]>(`/api/exam-cell/ufm-cases${suffix}`));
    } catch {
      toast.error('Could not load UFM case history');
    } finally {
      setLoadingCases(false);
    }
  }, [api, filterYear, filterMonth]);

  useEffect(() => {
    void loadOptions().catch(() => toast.error('Could not load student list — restart backend after npm run build'));
  }, [loadOptions]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const lookupPlaceholder = useMemo(() => {
    if (lookupType === 'EMAIL') return 'student@sgvu.edu.in';
    if (lookupType === 'SID') return 'Student user ID (UUID)';
    return 'e.g. SGVU2022CSE001';
  }, [lookupType]);

  async function logCase() {
    const studentRef = form.student_ref.trim() || form.student_pick.trim();
    if (!studentRef) {
      toast.error('Select a student or enter their identifier');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Enter an incident description');
      return;
    }
    const courseCode = courses.find((c) => c.course_id === form.course_id)?.course_code;
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
      await loadCases();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to log UFM case');
    } finally {
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
          <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
          <h1 className="text-2xl font-bold text-sgvu-navy">UFM Malpractice Desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step 1: Select semester → Step 2: Pick department & student → Step 3: Choose course scope → Log case.
          </p>
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>1. Semester</label>
              <Select className={fieldClass} value={semester} onChange={(e) => setSemester(e.target.value)}>
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
                className={fieldClass}
                value={department || 'ALL'}
                onChange={(e) => setDepartment(e.target.value === 'ALL' ? '' : e.target.value)}
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
                className={fieldClass}
                value={form.course_id || 'ALL'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, course_id: e.target.value === 'ALL' ? '' : e.target.value }))
                }
              >
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
                className={fieldClass}
                value={form.student_pick || undefined}
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
                  className={fieldClass}
                  value={lookupType}
                  onChange={(e) => setLookupType(e.target.value as LookupType)}
                >
                  <option value="ENROLLMENT">Enrollment</option>
                  <option value="EMAIL">Email</option>
                  <option value="SID">Student ID</option>
                </Select>
                <Input
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
                className="min-h-[96px] w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 py-2.5 text-sm text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25"
                placeholder="Describe what happened during the exam…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className={labelClass}>Penalty</label>
              <Input
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
              disabled={submitting}
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
                <Select className={`${fieldClass} w-[7.5rem]`} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
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
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-4 py-10 text-center text-sm text-muted-foreground">
              Loading case history…
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
