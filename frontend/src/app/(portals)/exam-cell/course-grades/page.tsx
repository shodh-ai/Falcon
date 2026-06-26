'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

export default function CourseGradesPage() {
  const api = useAuthedApi();
  const [gradesSemester, setGradesSemester] = useState<string>('');
  const [gradesCourseId, setGradesCourseId] = useState<string>('');
  const [gradesCourses, setGradesCourses] = useState<{ course_id: string; course_code: string; course_name: string; }[]>([]);
  const [gradesData, setGradesData] = useState<any[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);

  useEffect(() => {
    if (!gradesSemester) {
      setGradesCourses([]);
      setGradesCourseId('');
      setGradesData([]);
      return;
    }
    api.get<any[]>(`/api/exam-cell/grades-aggregate/courses?semester=${gradesSemester}`)
       .then(data => {
         setGradesCourses(data);
         if (!data.some(d => d.course_id === gradesCourseId)) {
           setGradesCourseId('');
           setGradesData([]);
         }
       })
       .catch(() => setGradesCourses([]));
  }, [gradesSemester, api, gradesCourseId]);

  useEffect(() => {
    if (!gradesSemester || !gradesCourseId) {
      setGradesData([]);
      return;
    }
    setGradesLoading(true);
    api.get<any[]>(`/api/exam-cell/grades-aggregate/table?semester=${gradesSemester}&course_id=${gradesCourseId}`)
       .then(setGradesData)
       .catch(() => toast.error('Failed to load aggregated grades'))
       .finally(() => setGradesLoading(false));
  }, [gradesSemester, gradesCourseId, api]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Course Grades</h1>
        <p className="text-muted-foreground">View aggregated course grades for students.</p>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <Select 
              className="rounded-md border px-3 py-1.5 text-sm" 
              value={gradesSemester} 
              onChange={(e) => setGradesSemester(e.target.value)}
            >
              <option value="">Select Semester</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
            </Select>
            <Select 
              className="rounded-md border px-3 py-1.5 text-sm" 
              value={gradesCourseId} 
              onChange={(e) => setGradesCourseId(e.target.value)}
              disabled={!gradesSemester || gradesCourses.length === 0}
            >
              <option value="">Select Course</option>
              {gradesCourses.map(c => <option key={c.course_id} value={c.course_id}>{c.course_code} - {c.course_name}</option>)}
            </Select>
          </div>
        </div>

        {gradesSemester && gradesCourseId ? (
          <Card>
            <CardContent className="p-0">
              {gradesLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading aggregated grades...</div>
              ) : gradesData.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">No students enrolled in this course for this semester.</div>
              ) : (
                <div className="max-h-[700px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Student Name</th>
                        <th className="px-4 py-3 text-right font-semibold">Quiz (10)</th>
                        <th className="px-4 py-3 text-right font-semibold">Internal (10)</th>
                        <th className="px-4 py-3 text-right font-semibold">Mid-Term (30)</th>
                        <th className="px-4 py-3 text-right font-semibold">End-Term (50)</th>
                        <th className="px-4 py-3 text-right font-semibold">Aggregate (100)</th>
                        <th className="px-4 py-3 text-center font-semibold">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradesData.map((row) => {
                        let gradeClass = '';
                        if (row.grade === 'Pending') gradeClass = 'text-gray-400 italic';
                        else if (row.grade === 'F') gradeClass = 'text-red-600 font-bold';
                        else if (row.grade === 'AA' || row.grade === 'AB') gradeClass = 'text-green-600 font-bold';
                        else gradeClass = 'text-yellow-600 font-bold';

                        return (
                          <tr key={row.student_id} className="border-t hover:bg-slate-50">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-sgvu-navy">{row.student_name}</div>
                              <div className="text-xs text-muted-foreground">{row.student_id.slice(0, 8)}...</div>
                            </td>
                            <td className="px-4 py-2.5 text-right">{row.quiz_marks}</td>
                            <td className="px-4 py-2.5 text-right">{row.internal_marks}</td>
                            <td className="px-4 py-2.5 text-right">{row.mid_term_marks}</td>
                            <td className="px-4 py-2.5 text-right">{row.end_term_marks}</td>
                            <td className={`px-4 py-2.5 text-right ${row.aggregate === 'Pending' ? 'text-gray-400 italic' : 'font-semibold'}`}>{row.aggregate}</td>
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
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Select a semester and course to view aggregated grades.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
