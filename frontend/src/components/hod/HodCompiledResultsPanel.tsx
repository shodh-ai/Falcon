'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { downloadAuthedFile } from '@/lib/hod-download';

type CourseOption = {
  course_id: string;
  course_code: string;
  course_name: string;
  semester: number;
};

type StudentRow = {
  student_user_id: string;
  student_name: string;
  enrollment_no: string;
  email: string;
  marks: Record<string, number | string>;
  total_marks: number | null;
};

type TablePayload = {
  course: { course_code: string; course_name: string };
  semester: number;
  exam_types: string[];
  students: StudentRow[];
};

export function HodCompiledResultsPanel() {
  const api = useAuthedApi();
  const { token } = useAuth();
  const [semester, setSemester] = useState('5');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [table, setTable] = useState<TablePayload | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoadingCourses(true);
    void api
      .get<CourseOption[]>(`/api/academics/hod/compiled-results/courses?semester=${semester}`)
      .then((rows) => {
        setCourses(rows);
        setCourseId(rows[0]?.course_id ?? '');
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load subjects');
        setCourses([]);
        setCourseId('');
      })
      .finally(() => setLoadingCourses(false));
  }, [api, semester]);

  useEffect(() => {
    if (!courseId) {
      setTable(null);
      return;
    }
    setLoadingTable(true);
    void api
      .get<TablePayload>(
        `/api/academics/hod/compiled-results/table?semester=${semester}&course_id=${courseId}`,
      )
      .then(setTable)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load marks');
        setTable(null);
      })
      .finally(() => setLoadingTable(false));
  }, [api, semester, courseId]);

  async function exportMarks(studentUserId?: string) {
    if (!token || !courseId) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams({
        semester,
        course_id: courseId,
      });
      if (studentUserId) qs.set('student_user_id', studentUserId);
      await downloadAuthedFile(
        `/api/academics/hod/compiled-results/export?${qs.toString()}`,
        token,
        studentUserId
          ? `student-marks-${semester}.xlsx`
          : `compiled-results-sem${semester}.xlsx`,
      );
      toast.success('Excel downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-sgvu-navy">Compiled End-Semester Results</h3>
          <p className="text-sm text-muted-foreground">
            Choose semester and subject to view live marks from faculty grading workspace.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!table?.students.length || exporting}
          onClick={() => void exportMarks()}
          className="gap-2"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export all students
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={semester} onValueChange={setSemester}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semester" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <SelectItem key={s} value={String(s)}>
                Semester {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={courseId} onValueChange={setCourseId} disabled={loadingCourses || !courses.length}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder={loadingCourses ? 'Loading subjects…' : 'Select subject'} />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.course_id} value={c.course_id}>
                {c.course_code} — {c.course_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadingTable ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      ) : !table?.students.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No enrolled students or marks found for this subject.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Student</th>
                {table.exam_types.map((t) => (
                  <th key={t} className="px-3 py-3 text-center">
                    {t}
                  </th>
                ))}
                <th className="px-3 py-3 text-center">Total</th>
                <th className="px-4 py-3 text-right">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.students.map((s) => (
                <tr key={s.student_user_id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sgvu-navy">{s.student_name}</p>
                    <p className="text-xs text-muted-foreground">{s.enrollment_no || s.email}</p>
                  </td>
                  {table.exam_types.map((t) => (
                    <td key={t} className="px-3 py-3 text-center tabular-nums">
                      {s.marks[t] ?? '—'}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-bold tabular-nums">
                    {s.total_marks ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={exporting}
                      onClick={() => void exportMarks(s.student_user_id)}
                    >
                      Excel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
