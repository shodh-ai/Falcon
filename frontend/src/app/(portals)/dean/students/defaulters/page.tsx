'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Row = {
  user_id: string;
  name: string;
  email: string;
  average_attendance: number;
  average_grade_points: number | null;
  course_count: number;
  low_attendance_courses: number;
  failing_courses: number;
};

export default function DeanDefaultersPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows((await deanApi.slowLearners()) as Row[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load defaulters');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [deanApi]);

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Defaulters & Slow Learners"
        description="Students with low attendance or weak grades across the school."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.user_id}
        empty="No at-risk students in school scope."
        columns={[
          {
            key: 'name',
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
            label: 'Avg Attendance',
            className: 'w-28 tabular-nums font-bold',
            render: (r) => `${r.average_attendance}%`,
          },
          {
            key: 'grades',
            label: 'Avg GPA',
            className: 'w-24 tabular-nums',
            render: (r) => r.average_grade_points ?? '—',
          },
          {
            key: 'flags',
            label: 'Flags',
            render: (r) => `${r.low_attendance_courses} att · ${r.failing_courses} fail`,
          },
        ]}
      />
    </HodPageFrame>
  );
}
