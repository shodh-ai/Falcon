'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
  HodTableHead,
  HodTableWrap,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Slot = {
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

type FacultyOption = { user_id: string; name: string; email: string | null; department: string | null };

const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DeanCourseAllocationPage() {
  const api = useAuthedApi();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<{ slots: Slot[]; faculty: FacultyOption[] }>(
          '/api/academics/dean/course-allocation',
        );
        setSlots(data.slots);
        setFaculty(data.faculty);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load allocation slots');
        setSlots([]);
        setFaculty([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const stats = useMemo(() => {
    const unassigned = slots.filter((s) => !s.faculty_user_id).length;
    return {
      total: slots.length,
      unassigned,
      faculty: faculty.length,
    };
  }, [slots, faculty]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Course Allocation Review"
        description="Read-only view of faculty course assignments across your school's departments."
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <HodMetricChip label="Total Slots" value={stats.total} emphasis />
            <HodMetricChip label="Faculty Pool" value={stats.faculty} />
            {stats.unassigned > 0 ? (
              <HodMetricChip label="Unassigned" value={stats.unassigned} />
            ) : null}
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : slots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          No timetable slots found for your school.
        </p>
      ) : (
        <HodTableWrap>
          <table className="w-full min-w-full text-left text-sm">
            <HodTableHead columns={['Course', 'Day', 'Time', 'Room', 'Faculty Assigned']} />
            <tbody>
              {slots.map((slot, i) => (
                <tr
                  key={slot.timetable_id}
                  className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sgvu-navy">{slot.course_code}</p>
                    <p className="text-muted-foreground">{slot.course_name}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">{DOW[slot.day_of_week]}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {String(slot.start_time).slice(0, 5)}–{String(slot.end_time).slice(0, 5)}
                  </td>
                  <td className="px-4 py-3">{slot.room ?? '—'}</td>
                  <td className="px-4 py-3">
                    {slot.faculty_user_id ? (
                      <span className="font-medium text-sgvu-navy">{slot.faculty_name}</span>
                    ) : (
                      <span className="text-amber-600 font-medium">Unassigned</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </HodTableWrap>
      )}
    </HodPageFrame>
  );
}
