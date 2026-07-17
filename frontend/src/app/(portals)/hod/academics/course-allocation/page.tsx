'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X, GripVertical } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodMetricChip,
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

const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS = [
  { val: 1, label: 'Mon' },
  { val: 2, label: 'Tue' },
  { val: 3, label: 'Wed' },
  { val: 4, label: 'Thu' },
  { val: 5, label: 'Fri' },
  { val: 6, label: 'Sat' },
];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;

function formatTime(hour: number) {
  const h = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${ampm}`;
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
    const activeCourseIds = new Set(activeAllocations.map(a => a.course_id));
    return gridSlots.filter((s) => activeCourseIds.has(s.course_id));
  }, [gridSlots, activeAllocations]);

  function handleDragStart(e: React.DragEvent, sourceData: any) {
    e.dataTransfer.setData('application/json', JSON.stringify(sourceData));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, dayOfWeek: number, hour: number) {
    e.preventDefault();
    if (hour === LUNCH_HOUR) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const start_time = `${hour.toString().padStart(2, '0')}:00:00`;
      const end_time = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

      if (data.type === 'NEW') {
        const newSlot: TimetableSlot = {
          timetable_id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          course_id: data.allocation.course_id,
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
          if (s === data.slot || (s.day_of_week === data.slot.day_of_week && s.start_time === data.slot.start_time && s.course_id === data.slot.course_id)) {
            return { ...s, day_of_week: dayOfWeek, start_time, end_time };
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

        {/* Left Side: Compact Timetable Grid */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Time</th>
                {DAYS.map(day => (
                  <th key={day.val} className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-sgvu-navy uppercase tracking-wider text-center w-24">
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map(hour => {
                const isLunch = hour === LUNCH_HOUR;
                const timeStr = `${hour.toString().padStart(2, '0')}:00:00`;
                return (
                  <tr key={hour}>
                    <td className="p-1 border-b border-r bg-slate-50 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap align-middle">
                      {formatTime(hour)}
                    </td>
                    {isLunch ? (
                      <td colSpan={6} className="p-1 border-b bg-slate-100 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                        Lunch
                      </td>
                    ) : (
                      DAYS.map(day => {
                        const slotsInCell = activeGridSlots.filter(s => s.day_of_week === day.val && s.start_time === timeStr);
                        return (
                          <td
                            key={`${day.val}-${hour}`}
                            className="p-1 border-b border-r h-14 align-top relative min-w-[90px]"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, day.val, hour)}
                          >
                            <div className="absolute inset-0 z-0 p-0.5">
                              <div className="w-full h-full border hover:border-sgvu-gold/50 rounded transition-colors" />
                            </div>
                            <div className="relative z-10 flex flex-col gap-0.5 w-full h-full">
                              {slotsInCell.map((slot, i) => (
                                <div
                                  key={i}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, { type: 'MOVE', slot })}
                                  className="group bg-sgvu-navy text-white text-[9px] rounded p-1 shadow-sm cursor-grab active:cursor-grabbing border-l-2 border-sgvu-gold hover:shadow-md transition-all relative flex flex-col leading-tight"
                                >
                                  <button
                                    onClick={() => removeSlot(slot)}
                                    className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 rounded-full text-white"
                                    title="Remove slot"
                                  >
                                    <X className="h-2 w-2" />
                                  </button>
                                  <span className="font-bold truncate pr-3">{slot.course_code}</span>
                                  {slot.faculty_name && (
                                    <span className="text-[7.5px] font-medium truncate opacity-90 leading-[10px] mt-0.5">{slot.faculty_name}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
