'use client';

import { useEffect, useState } from 'react';
import { BookOpen, CalendarRange, TrendingUp } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

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
  progression: { semester: number; status: string; courses_count: number }[];
};

export default function StudentAttendancePage() {
  const api = useAuthedApi();
  const [data, setData] = useState<AttendanceData | null>(null);

  useEffect(() => {
    void api.get<AttendanceData>('/api/student/attendance').then(setData);
  }, [api]);

  const overall = data?.overall_percent ?? 0;
  const overallTone = overall >= 75 ? 'success' : 'warning';

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Attendance & Progression"
        description="Course-wise attendance summary and semester progression from Sem 1 through Sem 8."
      />

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
          <StudentEmptyState title="No subject records" description="Attendance data will appear once courses are active." />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
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
        )}
      </StudentSectionCard>

      <StudentSectionCard title="Academic progression" description="Semester completion status across your program" icon={CalendarRange}>
        {(data?.progression ?? []).length === 0 ? (
          <StudentEmptyState title="No progression data" description="Semester progression will appear as you advance." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(data?.progression ?? []).map((p) => (
              <Badge
                key={p.semester}
                variant={p.status === 'COMPLETED' ? 'default' : p.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                className="px-3 py-1.5 text-xs"
              >
                Sem {p.semester}: {p.status.replace('_', ' ')} ({p.courses_count} courses)
              </Badge>
            ))}
          </div>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
