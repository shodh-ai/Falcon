'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Row = {
  timetable_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  faculty_user_id: string;
  faculty_name: string;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DeanTimetablePage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setRows((await deanApi.timetable()) as Row[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load timetable');
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
        title="School Timetable"
        description="Cross-department timetable review — read-only oversight view."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.timetable_id}
        empty="No timetable slots in school scope."
        columns={[
          {
            key: 'day',
            label: 'Day',
            className: 'w-16',
            render: (r) => DAYS[r.day_of_week] ?? r.day_of_week,
          },
          {
            key: 'time',
            label: 'Time',
            className: 'w-28 tabular-nums',
            render: (r) => `${r.start_time}–${r.end_time}`,
          },
          {
            key: 'course',
            label: 'Course',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.course_code}</p>
                <p className="text-muted-foreground">{r.course_name}</p>
              </div>
            ),
          },
          { key: 'faculty', label: 'Faculty', render: (r) => r.faculty_name },
          { key: 'room', label: 'Room', className: 'w-24', render: (r) => r.room ?? '—' },
        ]}
      />
    </HodPageFrame>
  );
}
