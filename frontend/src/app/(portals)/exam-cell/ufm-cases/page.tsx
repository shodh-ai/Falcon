'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
};

type StudentOption = {
  user_id: string;
  name: string;
  official_email: string;
  enrollment_number: string | null;
};

type CourseOption = {
  course_id: string;
  course_code: string;
  course_name: string;
};

export default function ExamCellUfmPage() {
  const api = useAuthedApi();
  const [cases, setCases] = useState<UfmCase[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [form, setForm] = useState({
    student_pick: '',
    student_ref: '',
    description: '',
    penalty_applied: 'Exam cancelled — UFM',
    course_id: '',
  });

  const load = useCallback(async () => {
    const [caseRows, options] = await Promise.all([
      api.get<UfmCase[]>('/api/exam-cell/ufm-cases'),
      api.get<{ students: StudentOption[]; courses: CourseOption[] }>('/api/exam-cell/ufm-cases/form-options'),
    ]);
    setCases(caseRows);
    setStudents(options.students ?? []);
    setCourses(options.courses ?? []);
  }, [api]);

  useEffect(() => {
    void load().catch(() => toast.error('Could not load UFM desk data'));
  }, [load]);

  async function logCase() {
    const studentRef = form.student_ref.trim() || form.student_pick.trim();
    if (!studentRef) {
      toast.error('Select a student or enter enrollment number / email');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Enter an incident description');
      return;
    }
    try {
      await api.post('/api/exam-cell/ufm-cases', {
        student_user_id: studentRef,
        description: form.description.trim(),
        penalty_applied: form.penalty_applied.trim() || undefined,
        course_id: form.course_id.trim() || undefined,
      });
      toast.success('UFM logged — marks zeroed & transcripts locked');
      setForm({ student_pick: '', student_ref: '', description: '', penalty_applied: 'Exam cancelled — UFM', course_id: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">UFM Malpractice Desk</h1>
        <p className="text-sm text-muted-foreground">Logging a case instantly zeros marks and withholds grade cards.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Log new UFM case</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Student</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={form.student_pick}
                onChange={(e) => setForm((f) => ({ ...f, student_pick: e.target.value, student_ref: '' }))}
              >
                <option value="">Select from list</option>
                {students.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
                    {s.enrollment_number ? ` · ${s.enrollment_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Or enrollment / email</label>
              <Input
                placeholder="e.g. SGVU-2026-1004"
                value={form.student_ref}
                onChange={(e) => setForm((f) => ({ ...f, student_ref: e.target.value, student_pick: '' }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Course scope (optional)</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.course_id}
              onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
            >
              <option value="">All courses — zero all marks</option>
              {courses.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Incident description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Input placeholder="Penalty" value={form.penalty_applied} onChange={(e) => setForm((f) => ({ ...f, penalty_applied: e.target.value }))} />
          <Button onClick={() => void logCase()}>Log UFM & lock results</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {cases.map((c) => (
          <div key={c.case_id} className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-bold text-red-900">{c.student_name ?? 'Student'}</p>
              <Badge variant="destructive">{c.status}</Badge>
            </div>
            <p className="mt-1">{c.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.penalty_applied} · {c.marks_locked ? 'Marks locked' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
