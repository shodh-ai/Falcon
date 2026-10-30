'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X, GripVertical } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodMetricChip,
  HodDayTabs,
  HodPageFrame,
  HodPageHeader,
  HodTableHead,
  HodTableWrap,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Allocation = {
  allocation_id: string;
  semester: string;
  course_id: string;
  course_code: string;
  course_name: string;
  faculty_user_id: string;
  faculty_name: string;
};

type TimetableSlot = {
  timetable_id?: string;
  course_id: string;
  semester?: string;
  faculty_user_id: string;
  course_code?: string;
  course_name?: string;
  faculty_name?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string | null;
};

type FacultyOption = { user_id: string; name: string; email: string | null };

const DAYS = [
  { val: 1, label: 'Mon' },
  { val: 2, label: 'Tue' },
  { val: 3, label: 'Wed' },
  { val: 4, label: 'Thu' },
  { val: 5, label: 'Fri' },
  { val: 6, label: 'Sat' },
];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
function formatTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function addHour(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  const total = hour * 60 + minute + 60;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

function moveEnd(originalStart: string, originalEnd: string, newStart: string) {
  const minutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
  const total = minutes(newStart) + minutes(originalEnd) - minutes(originalStart);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

export default function HodCourseAllocationPage() {
  const api = useAuthedApi();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [gridSlots, setGridSlots] = useState<TimetableSlot[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>(1);

  type DraftSlot = { faculty_user_id: string; day_of_week: number; start_time: string; end_time: string };
  const [draft, setDraft] = useState<Record<string, DraftSlot>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ allocations: Allocation[]; timetables: any[]; faculty: FacultyOption[] }>(
        '/api/academics/hod/course-allocation-timetable-data',
      );
      setAllocations(data.allocations || []);
      setFaculty(data.faculty || []);

      const mappedTimetables: TimetableSlot[] = (data.timetables || []).map((t) => ({
        timetable_id: t.timetable_id,
        course_id: t.course_id,
        semester: t.semester,
        faculty_user_id: t.faculty_user_id,
        course_code: t.course_code,
        course_name: t.course_name,
        faculty_name: t.faculty_name,
        day_of_week: t.day_of_week,
        start_time: t.start_time,
        end_time: t.end_time,
        room: t.room,
      }));
      setGridSlots(mappedTimetables);
      setDraft({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load timetable data');
      setAllocations([]);
      setGridSlots([]);
      setFaculty([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  const semesters = useMemo(() => {
    const sems = new Set(allocations.map(a => a.semester));
    return Array.from(sems).sort();
  }, [allocations]);

  useEffect(() => {
    if (!selectedSemester && semesters.length > 0) {
      setSelectedSemester(semesters[0]);
    }
  }, [semesters, selectedSemester]);

  const activeAllocations = useMemo(
    () => allocations.filter((a) => a.semester === selectedSemester),
    [allocations, selectedSemester]
  );

  const activeGridSlots = useMemo(() => {
    const activePairs = new Set(
      activeAllocations.map((a) => `${a.course_id}:${a.faculty_user_id}`),
    );
    return gridSlots.filter((s) => {
      // Timetable rows are shared across semester views. Never submit a row
      // belonging to another semester or faculty allocation.
      if (s.semester && s.semester !== selectedSemester) return false;
      return activePairs.has(`${s.course_id}:${s.faculty_user_id}`);
    });
  }, [gridSlots, activeAllocations, selectedSemester]);

  const timePoints = useMemo(() => [...new Set([
    ...HOURS.map((hour) => `${String(hour).padStart(2, '0')}:00:00`),
    ...activeGridSlots.map((slot) => slot.start_time),
  ])].sort(), [activeGridSlots]);
  const dayCounts = useMemo(() => Object.fromEntries(DAYS.map((day) => [day.val, activeGridSlots.filter((slot) => slot.day_of_week === day.val).length])), [activeGridSlots]);

  function handleDragStart(e: React.DragEvent, sourceData: any) {
    e.dataTransfer.setData('application/json', JSON.stringify(sourceData));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, dayOfWeek: number, start_time: string) {
    e.preventDefault();

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const end_time = addHour(start_time);

      if (data.type === 'NEW') {
        const newSlot: TimetableSlot = {
          timetable_id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          course_id: data.allocation.course_id,
          semester: data.allocation.semester,
          faculty_user_id: data.allocation.faculty_user_id,
          course_code: data.allocation.course_code,
          course_name: data.allocation.course_name,
          faculty_name: data.allocation.faculty_name,
          day_of_week: dayOfWeek,
          start_time,
          end_time,
        };
        setGridSlots(prev => [...prev, newSlot]);
      } else if (data.type === 'MOVE') {
        setGridSlots(prev => prev.map(s => {
          if (s.timetable_id === data.slot.timetable_id) {
            return { ...s, day_of_week: dayOfWeek, start_time, end_time: moveEnd(s.start_time, s.end_time, start_time) };
          }
          return s;
        }));
      }
    } catch (err) {
      console.error('Drop error', err);
      toast.error('Failed to move timetable slot');
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function removeSlot(slotToRemove: TimetableSlot) {
    setGridSlots(prev => prev.filter(s => s !== slotToRemove));
  }

  async function handleBatchSave() {
    if (!selectedSemester) return;

    const seen = new Set<string>();
    for (const slot of activeGridSlots) {
      const key = `${slot.course_id}:${slot.day_of_week}:${slot.start_time}:${slot.end_time}`;
      if (seen.has(key)) {
        toast.error('This course already has an overlapping timetable slot. Move one slot and try again.');
        return;
      }
      seen.add(key);
    }

    setSaving(true);
    try {
      await api.post('/api/academics/hod/course-allocation-timetable-batch-save', {
        semester: selectedSemester,
        slots: activeGridSlots.map(s => ({
          course_id: s.course_id,
          faculty_user_id: s.faculty_user_id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
      });
      toast.success('Timetable saved successfully');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save timetable');
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(timetableId: string, field: keyof DraftSlot, value: any) {
    setDraft((prev) => {
      const slot = gridSlots.find(s => s.timetable_id === timetableId)!;
      const existing = prev[timetableId] ?? {
        faculty_user_id: slot.faculty_user_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
      };
      return { ...prev, [timetableId]: { ...existing, [field]: value } };
    });
  }

  function updateAllocationDraft(allocationId: string, facultyUserId: string) {
    setDraft((prev) => {
      const alloc = activeAllocations.find(a => a.allocation_id === allocationId);
      if (!alloc) return prev;
      const existing = prev[allocationId] ?? {
        faculty_user_id: alloc.faculty_user_id,
      };
      return { ...prev, [allocationId]: { ...existing, faculty_user_id: facultyUserId } };
    });
  }

  async function saveIndividualSlot(slot: TimetableSlot) {
    if (!slot.timetable_id) return;
    const d = draft[slot.timetable_id];
    if (!d) {
      toast.message('No change to save');
      return;
    }
    setSavingId(slot.timetable_id);
    try {
      const updatedSlot = await api.post<TimetableSlot>('/api/academics/hod/course-allocation', {
        timetable_id: slot.timetable_id,
        course_id: slot.course_id,
        faculty_user_id: d.faculty_user_id,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
      });
      setGridSlots(prev => prev.map(s => s.timetable_id === slot.timetable_id ? { ...s, ...updatedSlot } : s));
      setDraft(prev => { const copy = { ...prev }; delete copy[slot.timetable_id!]; return copy; });
      toast.success(`Saved allocation for ${slot.course_code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      setSavingId(null);
    }
  }

  async function saveAllocation(alloc: Allocation) {
    const d = draft[alloc.allocation_id];
    if (!d || d.faculty_user_id === alloc.faculty_user_id) {
      toast.message('No change to save');
      return;
    }
    setSavingId(alloc.allocation_id);
    try {
      await api.post('/api/academics/hod/course-allocation', {
        course_id: alloc.course_id,
        faculty_user_id: d.faculty_user_id,
      });
      // Update local state
      setAllocations(prev => prev.map(a => a.allocation_id === alloc.allocation_id ? { ...a, faculty_user_id: d.faculty_user_id } : a));
      setGridSlots(prev => prev.map(s => s.course_id === alloc.course_id ? { ...s, faculty_user_id: d.faculty_user_id } : s));
      setDraft(prev => { const copy = { ...prev }; delete copy[alloc.allocation_id]; return copy; });
      toast.success(`Saved faculty for ${alloc.course_code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <HodPageFrame>
        <HodPageHeader title="Course Allocation" description="Loading timetable data..." />
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      </HodPageFrame>
    );
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Course Allocation"
        description="Assign subjects to faculty and schedule them onto the timetable."
        meta={
          <div className="flex items-center gap-3">
            <HodMetricChip label="Courses" value={activeAllocations.length} emphasis />
            <HodMetricChip label="Scheduled Slots" value={activeGridSlots.length} />
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm font-semibold text-sgvu-navy uppercase tracking-wider">Semester:</span>
              <Select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="w-32 rounded-lg border-gray-200"
              >
                {semesters.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <Button
              onClick={handleBatchSave}
              disabled={saving || !selectedSemester}
              className="ml-2 bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold-hover hover:shadow-md"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Timetable
            </Button>
          </div>
        }
      />

      <div className="mt-4 flex flex-col xl:flex-row gap-4 mb-8">

        {/* Exact published times, including half-hour and 50-minute starts. */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-base font-bold text-sgvu-navy">Schedule by day</h2>
            <p className="mt-1 text-sm text-slate-600">All recorded start times are shown. Drag a course into an open time or move a card; saving remains subject to clash checks.</p>
          </div>
          <div className="px-4 pt-4"><HodDayTabs days={DAYS.map((day) => ({ id: day.val, label: day.label }))} active={selectedDay} onChange={setSelectedDay} counts={dayCounts} /></div>
          <div className="max-h-[720px] space-y-5 overflow-y-auto p-4">
            {DAYS.filter((day) => selectedDay === 'all' || selectedDay === day.val).map((day) => (
              <section key={day.val} aria-label={`${day.label} classes`}>
                {selectedDay === 'all' && <h3 className="mb-2 text-sm font-bold text-sgvu-navy">{day.label}</h3>}
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {timePoints.map((time) => {
                    const slots = activeGridSlots.filter((slot) => slot.day_of_week === day.val && slot.start_time === time);
                    return <div key={`${day.val}-${time}`} className="grid min-h-16 grid-cols-[92px_minmax(0,1fr)] gap-3 px-3 py-2 sm:grid-cols-[118px_minmax(0,1fr)]">
                      <span className="pt-2 text-sm font-semibold tabular-nums text-slate-600">{formatTime(time)}</span>
                      <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-dashed border-slate-200 p-1.5 transition-colors hover:border-sgvu-gold hover:bg-amber-50/30"
                        onDragOver={handleDragOver} onDrop={(event) => handleDrop(event, day.val, time)}>
                        {slots.length ? slots.map((slot) => {
                          const tone = /practical|lab/i.test(slot.course_name || '') ? 'border-amber-200 bg-amber-50 text-amber-950' : /tutorial/i.test(slot.course_name || '') ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-blue-200 bg-blue-50 text-sgvu-navy';
                          return <div key={slot.timetable_id || `${slot.course_id}-${slot.faculty_user_id}`} draggable onDragStart={(event) => handleDragStart(event, { type: 'MOVE', slot })}
                            className={`group relative min-w-[210px] max-w-full flex-1 cursor-grab rounded-lg border px-3 py-2 text-sm shadow-sm active:cursor-grabbing ${tone}`}>
                            <button type="button" onClick={() => removeSlot(slot)} className="absolute right-2 top-2 rounded p-1 hover:bg-white/80" aria-label={`Remove ${slot.course_code} on ${day.label} at ${formatTime(time)}`}><X className="h-4 w-4" /></button>
                            <p className="pr-7 font-bold">{slot.course_code} · {slot.course_name}</p>
                            <p className="mt-1 text-xs">{slot.faculty_name || 'Faculty not shown'} · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}{slot.room ? ` · ${slot.room}` : ''}</p>
                          </div>;
                        }) : <span className="self-center px-2 text-xs text-slate-400">Open time · drop a course to add a one-hour slot</span>}
                      </div>
                    </div>;
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Right Side: Unassigned Pool */}
        <div className="w-full xl:w-56 flex-shrink-0 flex flex-col max-h-[350px]">
          <div className="bg-slate-50 border border-gray-200 rounded-xl flex flex-col h-full overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-white">
              <h3 className="font-bold text-sgvu-navy text-sm">Course Mappings</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Drag into the timetable.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {activeAllocations.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground mt-4">No mappings found.</div>
              ) : (
                activeAllocations.map(alloc => (
                  <div
                    key={alloc.allocation_id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'NEW', allocation: alloc })}
                    className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm hover:shadow-md hover:border-sgvu-gold transition-all cursor-grab active:cursor-grabbing flex gap-1.5 items-center"
                  >
                    <GripVertical className="h-3 w-3 text-slate-300 flex-shrink-0" />
                    <div className="flex flex-col overflow-hidden w-full">
                      <span className="font-bold text-sgvu-navy text-xs truncate">{alloc.course_code}</span>
                      <span className="text-[9px] text-slate-500 truncate mt-0.5">{alloc.faculty_name}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Original List View */}
      {activeAllocations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          No course allocations found for this semester.
        </p>
      ) : (
        <HodTableWrap>
          <table className="w-full min-w-full text-left text-sm">
            <HodTableHead columns={['Course', 'Faculty', '']} />
            <tbody>
              {activeAllocations.map((alloc, i) => {
                const current = draft[alloc.allocation_id] ?? {
                  faculty_user_id: alloc.faculty_user_id,
                };
                const changed = current.faculty_user_id !== alloc.faculty_user_id;
                return (
                  <tr
                    key={alloc.allocation_id}
                    className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sgvu-navy">{alloc.course_code}</p>
                      <p className="text-muted-foreground">{alloc.course_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="w-full min-w-[180px] rounded-md border border-gray-200 px-3 py-2 text-sm text-sgvu-navy"
                        value={current.faculty_user_id || ''}
                        onChange={(e) => updateAllocationDraft(alloc.allocation_id, e.target.value)}
                      >
                        <option value="" disabled>Select Faculty</option>
                        {faculty.map((f) => (
                          <option key={f.user_id} value={f.user_id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      {changed && alloc.faculty_name ? (
                        <p className="mt-1 text-sm text-muted-foreground">Previously: {alloc.faculty_name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="default"
                        className="h-9 bg-sgvu-navy text-sm hover:bg-sgvu-navy/90"
                        disabled={savingId === alloc.allocation_id || !changed}
                        onClick={() => void saveAllocation(alloc)}
                      >
                        {savingId === alloc.allocation_id ? (
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
