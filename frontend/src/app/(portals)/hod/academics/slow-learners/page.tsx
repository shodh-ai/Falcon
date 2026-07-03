'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { HodPageFrame, HodPageHeader, HodPanel } from '@/components/hod/HodPagePrimitives';

type SlowLearnerRow = {
  user_id: string;
  name: string;
  email: string;
  average_attendance: number;
  average_grade_points: number;
  course_count: number;
  low_attendance_courses: number;
  failing_courses: number;
};

export default function HodSlowLearnersPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<SlowLearnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<SlowLearnerRow[]>('/api/academics/hod/slow-learners')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Slow Learners & At-Risk Students"
        description="Students with average attendance below 75% or grade points below 5.0 in your department."
      />
      <HodPanel title="At-risk students" count={rows.length}>
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No at-risk students flagged.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Avg Attendance</th>
                  <th className="py-2 pr-4">Avg Grade</th>
                  <th className="py-2 pr-4">Low Att. Courses</th>
                  <th className="py-2">Failing Courses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id} className="border-b border-slate-50">
                    <td className="py-3 pr-4">
                      <p className="font-bold text-sgvu-navy">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{row.average_attendance}%</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{row.average_grade_points}</td>
                    <td className="py-3 pr-4 tabular-nums">{row.low_attendance_courses}</td>
                    <td className="py-3 tabular-nums">{row.failing_courses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HodPanel>
    </HodPageFrame>
  );
}
