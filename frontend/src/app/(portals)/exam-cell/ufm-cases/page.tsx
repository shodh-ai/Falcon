'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { ShieldAlert } from 'lucide-react';

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
        render: (c) => <Badge variant="destructive">{c.status}</Badge>,
      },
      {
        key: 'automation',
        header: 'Automated System Action',
        render: (c) => {
          const subject = c.exam_type ?? c.course_scope ?? 'All subjects';
          return (
            <div className="space-y-1.5">
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
                <ShieldAlert className="mr-1 inline h-3 w-3" />
                Marks locked to 0 for {subject}
              </Badge>
              <p className="text-xs font-medium text-red-700">Student grade card set to WITHHELD (UFM)</p>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">UFM Malpractice Desk</h1>
        <p className="text-sm text-muted-foreground">
          Step 1: Select semester → Step 2: Pick department & student → Step 3: Choose course scope → Log case.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Log new UFM case</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">1. Semester</label>
              <Select className="w-full rounded-md border px-3 py-2 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">2. Department</label>
              <Select className="w-full rounded-md border px-3 py-2 text-sm" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">3. Course (optional)</label>
              <Select className="w-full rounded-md border px-3 py-2 text-sm" value={form.course_id} onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}>
                <option value="">All courses — zero all marks</option>
                {courses.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_code} — {c.course_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Student (from filtered list)</label>
              <Select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.student_pick}
                onChange={(e) => setForm((f) => ({ ...f, student_pick: e.target.value, student_ref: '' }))}
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}{s.enrollment_number ? ` · ${s.enrollment_number}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Or look up by one identifier</label>
              <div className="flex gap-2">
                <Select className="w-36 shrink-0 rounded-md border px-2 py-2 text-sm" value={lookupType} onChange={(e) => setLookupType(e.target.value as LookupType)}>
                  <option value="ENROLLMENT">Enrollment</option>
                  <option value="EMAIL">Email</option>
                  <option value="SID">Student ID</option>
                </Select>
                <Input
                  placeholder={lookupPlaceholder}
                  value={form.student_ref}
                  onChange={(e) => setForm((f) => ({ ...f, student_ref: e.target.value, student_pick: '' }))}
                />
              </div>
            </div>
          </div>

          <textarea
            className="min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Incident description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input placeholder="Penalty" value={form.penalty_applied} onChange={(e) => setForm((f) => ({ ...f, penalty_applied: e.target.value }))} />
          <Button onClick={() => void logCase()} disabled={submitting}>
            {submitting ? 'Logging UFM…' : 'Log UFM & trigger auto-penalties'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">UFM case history</CardTitle>
            <p className="text-sm text-muted-foreground">Default: last 1 month. Filter by year and month for older records.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select className="rounded-md border px-2 py-1 text-sm" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </Select>
            <Select className="rounded-md border px-2 py-1 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
              <option value="">Last 1 month</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCases ? (
            <p className="text-sm text-muted-foreground">Loading case history…</p>
          ) : (
            <DataTable columns={tableColumns} rows={cases} rowKey={(c) => c.case_id} emptyMessage="No UFM cases in this period." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
