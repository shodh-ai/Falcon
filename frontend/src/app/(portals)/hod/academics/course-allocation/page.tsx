'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
  HodTableHead,
  HodTableWrap,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
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

type FacultyOption = { user_id: string; name: string; email: string | null };

const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HodCourseAllocationPage() {
  const api = useAuthedApi();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ slots: Slot[]; faculty: FacultyOption[] }>(
        '/api/academics/hod/course-allocation-slots',
      );
      setSlots(data.slots);
      setFaculty(data.faculty);
      setDraft({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load allocation slots');
      setSlots([]);
      setFaculty([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  const facultyById = useMemo(
    () => new Map(faculty.map((row) => [row.user_id, row.name])),
    [faculty],
  );

  const pendingChanges = useMemo(
    () => slots.filter((s) => (draft[s.timetable_id] ?? s.faculty_user_id) !== s.faculty_user_id).length,
    [slots, draft],
  );

  async function saveSlot(slot: Slot) {
    const facultyUserId = draft[slot.timetable_id] ?? slot.faculty_user_id;
    if (facultyUserId === slot.faculty_user_id) {
      toast.message('No change to save');
      return;
    }
    setSavingId(slot.timetable_id);
    try {
      await api.post('/api/academics/hod/course-allocation', {
        timetable_id: slot.timetable_id,
        faculty_user_id: facultyUserId,
      });
      toast.success(`${slot.course_code} → ${facultyById.get(facultyUserId) ?? 'faculty'}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Course Allocation"
        description="Assign subjects to faculty per timetable slot before the semester."
        meta={
          <>
            <HodMetricChip label="Slots" value={slots.length} emphasis />
            <HodMetricChip label="Faculty pool" value={faculty.length} />
            {pendingChanges > 0 ? (
              <HodMetricChip label="Unsaved" value={pendingChanges} />
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
          No timetable slots found for your department.
        </p>
      ) : (
        <HodTableWrap>
          <table className="w-full min-w-full text-left text-sm">
            <HodTableHead columns={['Course', 'Day', 'Time', 'Room', 'Faculty', '']} />
            <tbody>
              {slots.map((slot, i) => {
                const selected = draft[slot.timetable_id] ?? slot.faculty_user_id;
                const changed = selected !== slot.faculty_user_id;
                return (
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
                      <select
                        className="w-full min-w-[180px] rounded-md border border-gray-200 px-3 py-2 text-sm text-sgvu-navy"
                        value={selected}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [slot.timetable_id]: e.target.value }))
                        }
                      >
                        {faculty.map((f) => (
                          <option key={f.user_id} value={f.user_id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      {changed ? (
                        <p className="mt-1 text-sm text-muted-foreground">Previously: {slot.faculty_name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="default"
                        className="h-9 bg-sgvu-navy text-sm hover:bg-sgvu-navy/90"
                        disabled={savingId === slot.timetable_id || !changed}
                        onClick={() => void saveSlot(slot)}
                      >
                        {savingId === slot.timetable_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Assign'
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </HodTableWrap>
      )}
    </HodPageFrame>
  );
}
