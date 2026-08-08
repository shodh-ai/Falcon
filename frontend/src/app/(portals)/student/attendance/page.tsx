'use client';

import { useEffect, useState } from 'react';
import { BookOpen, CalendarRange, TrendingUp } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  DEMO_ATTENDANCE,
  DEMO_ATTENDANCE_SUMMARY,
} from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

type SubjectAttendance = {
  course_code: string;
  course_name: string;
  semester: number;
  attendance_percent: string;
  status: string;
  present_count: number;
  absent_count: number;
  total_classes: number;
};

type AttendanceData = {
  overall_percent: number;
  subject_wise: SubjectAttendance[];
  current_semester?: number;
  progression: { semester: number; status: string; courses_count: number }[];
};

function progressionBadgeClass(status: string) {
  if (status === 'COMPLETED') {
    return 'border-transparent bg-sgvu-navy text-white hover:bg-sgvu-navy';
  }
  if (status === 'IN_PROGRESS') {
    return 'border-transparent bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold';
  }
  return 'border-sgvu-navy/20 bg-white text-sgvu-navy hover:bg-white';
}

function courseCountLabel(count: number) {
  return `${count} ${count === 1 ? 'course' : 'courses'}`;
}

export default function StudentAttendancePage() {
  const api = useAuthedApi();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<AttendanceData>('/api/student/attendance')
      .then((payload) => {
        if (!payload?.subject_wise?.length) {
          setData(
            isStudentDemoModeEnabled()
              ? {
                  overall_percent: DEMO_ATTENDANCE_SUMMARY.overall_percent,
                  current_semester: DEMO_ATTENDANCE_SUMMARY.current_semester,
                  subject_wise: DEMO_ATTENDANCE,
                  progression: DEMO_ATTENDANCE_SUMMARY.progression,
                }
              : {
                  overall_percent: 0,
                  current_semester: payload?.current_semester,
                  subject_wise: [],
                  progression: payload?.progression ?? [],
                },
          );
        } else {
          setData(payload);
        }
      })
      .catch(() => {
        setData(
          isStudentDemoModeEnabled()
            ? {
                overall_percent: DEMO_ATTENDANCE_SUMMARY.overall_percent,
                current_semester: DEMO_ATTENDANCE_SUMMARY.current_semester,
                subject_wise: DEMO_ATTENDANCE,
                progression: DEMO_ATTENDANCE_SUMMARY.progression,
              }
            : {
                overall_percent: 0,
                subject_wise: [],
                progression: [],
              },
        );
      });
  }, [api]);

  const overall = data?.overall_percent ?? (isStudentDemoModeEnabled() ? DEMO_ATTENDANCE_SUMMARY.overall_percent : 0);
  const overallTone = overall >= 75 ? 'success' : 'warning';

  if (loading) {
    return <StudentLoadingState label="Loading attendance…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Attendance"
        description="Course-wise attendance summary and semester progression from Sem 1 through Sem 8."
      />

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p>
      ) : null}

      <StudentStatCard
        label="Overall attendance"
        value={`${overall}%`}
        helper={overall >= 75 ? 'Meeting minimum requirement' : 'Below 75% minimum — review subject-wise'}
        icon={TrendingUp}
        tone={overallTone}
      />

      <StudentSectionCard
        title="Course-wise attendance"
        description="Present, absent, and total classes marked till date"
        icon={BookOpen}
      >
        {(data?.subject_wise ?? []).length === 0 ? (
          <StudentEmptyState
            title={loadError ? 'Attendance unavailable' : 'No subject records'}
            description={
              loadError
                ? 'Try refreshing the page. If the problem persists, contact your department office.'
                : 'Attendance data will appear once courses are active.'
            }
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {(data?.subject_wise ?? []).map((row) => {
                const pct = Number(row.attendance_percent);
                const total =
                  row.total_classes > 0
                    ? row.total_classes
                    : row.present_count + row.absent_count;
                return (
                  <div
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
              <table className="w-full min-w-[720px] border-collapse text-sm">
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
                  {(data?.subject_wise ?? []).map((row) => {
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
      </StudentSectionCard>

      <StudentSectionCard
        title="Academic progression"
        description={
          data?.current_semester
            ? `Based on your current semester (Sem ${data.current_semester}). Past terms are completed; future terms stay upcoming.`
            : 'Semester completion status across your program'
        }
        icon={CalendarRange}
      >
        {(data?.progression ?? []).length === 0 ? (
          <StudentEmptyState title="No progression data" description="Semester progression will appear as you advance." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(data?.progression ?? []).map((p) => (
              <Badge
                key={p.semester}
                variant="outline"
                className={`px-3 py-1.5 text-xs ${progressionBadgeClass(p.status)}`}
              >
                Sem {p.semester}: {p.status.replace('_', ' ')} ({courseCountLabel(p.courses_count)})
              </Badge>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
