'use client';

import { useEffect, useState } from 'react';
import { BookOpen, TrendingUp } from 'lucide-react';
import { StudentAcademicProgression } from '@/components/student/StudentAcademicProgression';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthedApi } from '@/lib/api';
import { withStudentReadTimeout } from '@/lib/student-read-request';
import {
  getAttendanceSemesters,
  getCurrentAttendanceSemester,
  getSemesterAttendance,
  type StudentAttendanceData as AttendanceData,
  type StudentAttendanceSubject as SubjectAttendance,
} from '@/lib/student-attendance';

function SemesterAttendanceRecords({ rows, semester, loadError }: {
  rows: SubjectAttendance[];
  semester: number | null;
  loadError: string | null;
}) {
  return (
    <>
      {rows.length === 0 ? (
        <StudentEmptyState
          title={loadError ? 'Attendance unavailable' : 'No subject records'}
          description={
            loadError
              ? 'Try refreshing the page. If the problem persists, contact your department office.'
              : semester == null
                ? 'Attendance data will appear once courses are active.'
                : `Subjects for Semester ${semester} will appear once you are registered.`
          }
        />
      ) : (
        <>
          <div role="list" aria-label={semester == null ? "Course attendance cards" : `Semester ${semester} attendance cards`} className="space-y-3 md:hidden">
            {rows.map((row) => {
              const pct = Number(row.attendance_percent);
              const total =
                row.total_classes > 0
                  ? row.total_classes
                  : row.present_count + row.absent_count;
              return (
                <div
                  role="listitem"
                  key={`${row.course_code}-${row.semester}-card`}
                  className="rounded-xl border border-sgvu-navy/10 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-sgvu-gold">
                        {row.course_code}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-sgvu-navy">{row.course_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Semester {row.semester}</p>
                    </div>
                    <Badge variant={pct >= 75 ? 'success' : 'destructive'}>{pct.toFixed(1)}%</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="font-bold text-destructive">{row.absent_count ?? 0}</p>
                      <p className="text-muted-foreground">Absent</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="font-bold text-emerald-700">{row.present_count ?? 0}</p>
                      <p className="text-muted-foreground">Present</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="font-bold text-sgvu-navy">{total}</p>
                      <p className="text-muted-foreground">Total</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table aria-label={semester == null ? "Course attendance" : `Semester ${semester} course attendance`} className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-sgvu-navy">Course Code</th>
                  <th className="px-4 py-3 font-semibold text-sgvu-navy">Course Name</th>
                  <th className="px-4 py-3 text-right font-semibold text-sgvu-navy">Absent</th>
                  <th className="px-4 py-3 text-right font-semibold text-sgvu-navy">Present</th>
                  <th className="px-4 py-3 text-right font-semibold text-sgvu-navy">Total Classes</th>
                  <th className="px-4 py-3 text-right font-semibold text-sgvu-navy">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pct = Number(row.attendance_percent);
                  const total =
                    row.total_classes > 0
                      ? row.total_classes
                      : row.present_count + row.absent_count;
                  return (
                    <tr key={`${row.course_code}-${row.semester}`} className="border-b last:border-0">
                      <td className="px-4 py-3 font-semibold text-sgvu-navy">{row.course_code}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{row.course_name}</p>
                          <p className="text-xs text-muted-foreground">Semester {row.semester}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-destructive">
                        {row.absent_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {row.present_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">{total}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={pct >= 75 ? 'success' : 'destructive'}>
                          {pct.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function StudentAttendancePage() {
  const api = useAuthedApi();
  const [response, setResponse] = useState<{
    api: ReturnType<typeof useAuthedApi>;
    data: AttendanceData | null;
    error: string | null;
  } | null>(null);
  const [selection, setSelection] = useState<{
    api: ReturnType<typeof useAuthedApi>;
    semester: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void withStudentReadTimeout(api.get<AttendanceData>('/api/student/attendance'))
      .then((payload) => {
        if (cancelled) return;
        setResponse({
          api,
          data: payload ?? { overall_percent: 0, subject_wise: [], progression: [] },
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResponse({ api, data: null, error: 'Attendance could not be loaded. Please try again.' });
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const currentResponse = response?.api === api ? response : null;
  const data = currentResponse?.data ?? null;
  const loading = currentResponse == null;
  const loadError = currentResponse?.error ?? null;
  const subjects = data?.subject_wise ?? [];
  const semesters = getAttendanceSemesters(data);
  const defaultSemester = getCurrentAttendanceSemester(data);
  const activeSemester = selection?.api === api && semesters.includes(selection.semester)
    ? selection.semester
    : defaultSemester;
  const semesterTotals = getSemesterAttendance(subjects, activeSemester);
  const semesterPercent = semesterTotals.percent;
  const semesterTone = loadError || semesterPercent == null
    ? 'default'
    : semesterPercent >= 75 ? 'success' : 'warning';
  const semesterHelper = loadError
    ? 'Attendance data is temporarily unavailable.'
    : activeSemester == null
      ? 'No semester attendance records are available yet.'
      : semesterPercent == null
        ? `No classes have been marked for Semester ${activeSemester} yet.`
        : `${semesterTotals.attended} of ${semesterTotals.marked} ${semesterTotals.marked === 1 ? 'class' : 'classes'} attended · ${semesterPercent >= 75 ? 'Meeting minimum requirement' : 'Below 75% minimum — review subject-wise'}`;

  if (loading) {
    return <StudentLoadingState label="Loading attendance…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Attendance"
        description="Choose a semester to view its subjects and attendance records."
      />

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p>
      ) : null}

      <StudentStatCard
        label={activeSemester == null ? 'Semester attendance' : `Semester ${activeSemester} attendance`}
        value={loadError ? 'Unavailable' : semesterPercent == null ? 'Not recorded' : `${Number(semesterPercent.toFixed(2))}%`}
        helper={semesterHelper}
        icon={TrendingUp}
        tone={semesterTone}
      />

      <StudentSectionCard
        title="Course-wise attendance"
        description="Present, absent, and total classes marked till date"
        icon={BookOpen}
      >
        {semesters.length > 0 ? (
          <Tabs
            value={String(activeSemester)}
            onValueChange={(value) => setSelection({ api, semester: Number(value) })}
            className="min-w-0"
          >
            <TabsList aria-label="Attendance semesters" className="w-full justify-start overflow-x-auto">
              {semesters.map((semester) => (
                <TabsTrigger key={semester} value={String(semester)} className="flex-none px-4">
                  Semester {semester}
                </TabsTrigger>
              ))}
            </TabsList>
            {semesters.map((semester) => (
              <TabsContent key={semester} value={String(semester)}>
                <SemesterAttendanceRecords
                  rows={subjects.filter((row) => Number(row.semester) === semester)}
                  semester={semester}
                  loadError={loadError}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <SemesterAttendanceRecords rows={subjects} semester={null} loadError={loadError} />
        )}
      </StudentSectionCard>

      <StudentAcademicProgression
        progression={data?.progression ?? []}
        currentSemester={data?.current_semester}
      />
    </StudentPageShell>
  );
}
