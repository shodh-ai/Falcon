'use client';

import { useEffect, useState } from 'react';
import { BookOpen, CalendarRange, TrendingUp } from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthedApi } from '@/lib/api';

type AttendanceData = {
  overall_percent: number;
  subject_wise: { course_code: string; course_name: string; semester: number; attendance_percent: string; status: string }[];
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
        description="Subject-wise attendance health and semester progression timeline from Sem 1 through Sem 8."
      />

      <StudentStatCard
        label="Overall attendance"
        value={`${overall}%`}
        helper={overall >= 75 ? 'Meeting minimum requirement' : 'Below 75% minimum — review subject-wise'}
        icon={TrendingUp}
        tone={overallTone}
      />

      <StudentSectionCard title="Subject-wise attendance" description="Per-course breakdown for the current semester" icon={BookOpen}>
        {(data?.subject_wise ?? []).length === 0 ? (
          <StudentEmptyState title="No subject records" description="Attendance data will appear once courses are active." />
        ) : (
          <div className="space-y-3">
            {(data?.subject_wise ?? []).map((s) => {
              const pct = Number(s.attendance_percent);
              return (
                <div
                  key={`${s.course_code}-${s.semester}`}
                  className="rounded-2xl border border-border/70 bg-white p-4 transition hover:border-sgvu-gold/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-sgvu-navy">
                        {s.course_code} — {s.course_name}
                      </p>
                      <p className="text-xs text-muted-foreground">Semester {s.semester}</p>
                    </div>
                    <Badge variant={pct >= 75 ? 'success' : 'destructive'}>{pct.toFixed(1)}%</Badge>
                  </div>
                  <Progress value={pct} className="mt-3 h-2" />
                </div>
              );
            })}
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
