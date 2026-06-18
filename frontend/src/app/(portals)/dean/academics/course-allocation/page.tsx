'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { createDeanApi } from '@/lib/api/api.dean';

type Slot = {
  timetable_id: string;
  course_code: string;
  course_name: string;
  faculty_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

export default function DeanCourseAllocationPage() {
  const api = useAuthedApi();
  const deanApi = useMemo(() => createDeanApi(api), [api]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await deanApi.courseAllocation();
        setSlots((data.slots ?? []) as Slot[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load course allocation');
        setSlots([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [deanApi]);

  return (
    <HodPageFrame>
      <HodPageHeader
        workspaceLabel="Dean Workspace"
        title="Course Allocation Review"
        description="Review faculty assignments across departments. HODs manage day-to-day allocation."
      />
      <HodDataTable
        loading={loading}
        rows={slots}
        rowKey={(r) => r.timetable_id}
        empty="No allocation slots in school scope."
        columns={[
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
          { key: 'faculty', label: 'Assigned Faculty', render: (r) => r.faculty_name },
          {
            key: 'slot',
            label: 'Slot',
            render: (r) => `${r.start_time}–${r.end_time}${r.room ? ` · ${r.room}` : ''}`,
          },
        ]}
      />
    </HodPageFrame>
  );
}
