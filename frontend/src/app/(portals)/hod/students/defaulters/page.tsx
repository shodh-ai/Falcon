'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type Row = {
  user_id: string;
  name: string;
  email: string | null;
  average_attendance: number;
  average_grade_points: number | null;
  course_count: number;
  low_attendance_courses: number;
  failing_courses: number;
};

export default function HodDefaultersPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/hod/slow-learners');
        setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load defaulters');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Defaulters & Slow Learners"
        description="Students flagged by low attendance or weak grades."
        meta={<span>{rows.length} at-risk student{rows.length === 1 ? '' : 's'}</span>}
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.user_id}
        empty="No at-risk students flagged."
        columns={[
          {
            key: 'student',
            label: 'Student',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-muted-foreground">{r.email}</p>
              </div>
            ),
          },
          {
            key: 'attendance',
            label: 'Avg Att %',
            className: 'w-24 tabular-nums font-bold',
            render: (r) => `${r.average_attendance}%`,
          },
          {
            key: 'gpa',
            label: 'Avg GPA',
            className: 'w-20 tabular-nums',
            render: (r) => r.average_grade_points ?? '—',
          },
          {
            key: 'flags',
            label: 'Flags',
            render: (r) => (
              <span className="text-sm text-muted-foreground">
                {r.low_attendance_courses > 0 ? `${r.low_attendance_courses} low-att` : ''}
                {r.low_attendance_courses > 0 && r.failing_courses > 0 ? ' · ' : ''}
                {r.failing_courses > 0 ? `${r.failing_courses} failing` : ''}
                {!r.low_attendance_courses && !r.failing_courses ? '—' : ''}
              </span>
            ),
          },
        ]}
      />
    </HodPageFrame>
  );
}
