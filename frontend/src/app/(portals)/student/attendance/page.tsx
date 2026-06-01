'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Attendance & Progression"
        description="Subject-wise attendance health and semester progression timeline (Sem 1 → Sem 8)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-3xl font-black text-sgvu-navy">{data?.overall_percent ?? 0}%</p>
          <Progress value={data?.overall_percent ?? 0} className="h-3" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subject-wise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.subject_wise ?? []).map((s) => (
            <div key={`${s.course_code}-${s.semester}`} className="flex items-center justify-between text-sm">
              <span>{s.course_code} — {s.course_name}</span>
              <Badge variant={Number(s.attendance_percent) >= 75 ? 'default' : 'destructive'}>
                {Number(s.attendance_percent).toFixed(1)}%
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Academic progression</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(data?.progression ?? []).map((p) => (
            <Badge
              key={p.semester}
              variant={p.status === 'COMPLETED' ? 'default' : p.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}
            >
              Sem {p.semester}: {p.status.replace('_', ' ')}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
