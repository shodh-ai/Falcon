'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';

type GradeRow = {
  student_id: string;
  student_name: string;
  quiz_marks: number | string;
  internal_marks: number | string;
  mid_term_marks: number | string;
  end_term_marks: number | string;
  aggregate: number | string;
  grade: string;
};

type CourseOption = { course_id: string; course_code: string; course_name: string };
type LoadResult<T> = { api: ReturnType<typeof useAuthedApi>; key: string; data: T[]; error: string | null };

export default function CourseGradesPage() {
  const api = useAuthedApi();
  const [gradesSemester, setGradesSemester] = useState('4');
  const [gradesCourseId, setGradesCourseId] = useState('');
  const [coursesRetry, setCoursesRetry] = useState(0);
  const [gradesRetry, setGradesRetry] = useState(0);
  const [coursesResult, setCoursesResult] = useState<LoadResult<CourseOption> | null>(null);
  const [gradesResult, setGradesResult] = useState<LoadResult<GradeRow> | null>(null);
  const coursesKey = `${gradesSemester}:${coursesRetry}`;
  const coursesLoading = coursesResult?.api !== api || coursesResult?.key !== coursesKey;
  const coursesError = coursesLoading ? null : coursesResult.error;
  const gradesCourses = coursesLoading || coursesError ? [] : coursesResult.data;
  const selectedCourseId = gradesCourses.some((course) => course.course_id === gradesCourseId)
    ? gradesCourseId
    : gradesCourses[0]?.course_id ?? '';
  const gradesKey = `${coursesKey}:${selectedCourseId}:${gradesRetry}`;
  const gradesLoading = Boolean(selectedCourseId) && (gradesResult?.api !== api || gradesResult?.key !== gradesKey);
  const gradesError = gradesLoading || !selectedCourseId ? null : gradesResult?.error;
  const gradesData = gradesResult?.api === api && gradesResult?.key === gradesKey && !gradesError ? gradesResult.data : [];

  useEffect(() => {
    let current = true;
    api
      .get<CourseOption[]>(`/api/exam-cell/grades-aggregate/courses?semester=${gradesSemester}`)
      .then((data) => {
        if (current) setCoursesResult({ api, key: coursesKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (current) setCoursesResult({ api, key: coursesKey, data: [], error: error instanceof Error ? error.message : 'Could not load courses for this semester' });
      });
    return () => { current = false; };
  }, [gradesSemester, coursesKey, api]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let current = true;
    api
      .get<GradeRow[]>(`/api/exam-cell/grades-aggregate/table?semester=${gradesSemester}&course_id=${selectedCourseId}`)
      .then((data) => {
        if (current) setGradesResult({ api, key: gradesKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (current) setGradesResult({ api, key: gradesKey, data: [], error: error instanceof Error ? error.message : 'Failed to load aggregated grades' });
      });
    return () => { current = false; };
  }, [gradesSemester, selectedCourseId, gradesKey, api]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader
            pageId="course-grades"
            subtitle="Aggregated component marks — Quiz (10) + Internal (10) + Mid-Term CAT1+2 (30) + End-Term (50)."
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Select
          aria-label="Grades semester"
          className="rounded-md border px-3 py-1.5 text-sm"
          value={gradesSemester}
          onChange={(e) => { setGradesSemester(e.target.value); setGradesCourseId(''); }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={s}>
              Semester {s}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Grades course"
          className="rounded-md border px-3 py-1.5 text-sm"
          value={selectedCourseId}
          onChange={(e) => setGradesCourseId(e.target.value)}
          disabled={!gradesSemester || gradesCourses.length === 0}
        >
          <option value="">Select Course</option>
          {gradesCourses.map((c) => (
            <option key={c.course_id} value={c.course_id}>
              {c.course_code} — {c.course_name}
            </option>
          ))}
        </Select>
      </div>

      {coursesLoading ? (
        <div role="status" className="py-8 text-center text-sm text-muted-foreground">Loading courses…</div>
      ) : coursesError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>Could not load courses: {coursesError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setCoursesRetry((retry) => retry + 1)}>Retry courses</Button>
        </div>
      ) : selectedCourseId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{gradesLoading ? 'Loading grades' : gradesError ? 'Aggregated grades unavailable' : `${gradesData.length} students`}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {gradesLoading ? (
              <div role="status" className="py-12 text-center text-sm text-muted-foreground">Loading aggregated grades…</div>
            ) : gradesError ? (
              <div role="alert" className="p-4 text-sm text-red-900">
                <p>Could not load aggregated grades: {gradesError}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setGradesRetry((retry) => retry + 1)}>Retry grades</Button>
              </div>
            ) : gradesData.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No students enrolled in this course for this semester.
              </div>
            ) : (
              <div className="max-h-[700px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/50 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Student</th>
                      <th className="px-4 py-3 text-right font-semibold">Quiz (10)</th>
                      <th className="px-4 py-3 text-right font-semibold">Internal (10)</th>
                      <th className="px-4 py-3 text-right font-semibold">Mid-Term (30)</th>
                      <th className="px-4 py-3 text-right font-semibold">End-Term (50)</th>
                      <th className="px-4 py-3 text-right font-semibold">Total (100)</th>
                      <th className="px-4 py-3 text-center font-semibold">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradesData.map((row) => {
                      let gradeClass = 'text-yellow-600 font-bold';
                      if (row.grade === 'Pending') gradeClass = 'text-gray-400 italic';
                      else if (row.grade === 'F') gradeClass = 'text-red-600 font-bold';
                      else if (row.grade === 'AA' || row.grade === 'AB') gradeClass = 'text-green-600 font-bold';

                      return (
                        <tr key={row.student_id} className="border-t hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-sgvu-navy">{row.student_name}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right">{row.quiz_marks}</td>
                          <td className="px-4 py-2.5 text-right">{row.internal_marks}</td>
                          <td className="px-4 py-2.5 text-right">{row.mid_term_marks}</td>
                          <td className="px-4 py-2.5 text-right">{row.end_term_marks}</td>
                          <td
                            className={`px-4 py-2.5 text-right ${row.aggregate === 'Pending' ? 'text-gray-400 italic' : 'font-semibold'}`}
                          >
                            {row.aggregate}
                          </td>
                          <td className={`px-4 py-2.5 text-center ${gradeClass}`}>{row.grade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No courses are available for this semester.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
