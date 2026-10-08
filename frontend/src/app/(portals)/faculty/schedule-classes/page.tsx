'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  GripVertical,
  Loader2,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageShell,
  FacultyPageHeader,
  FacultyEmptyState,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isEmptyArray, isFacultyDemoEntityId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoScheduleData } from '@/lib/mock/faculty-portal-demo';
import { cn } from '@/lib/utils';

type Allocation = {
  allocation_id: string;
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
  section?: string | null;
};

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

const actionBtnClass =
  'h-10 min-w-[9.5rem] flex-1 border-0 bg-sgvu-navy text-white shadow-sm hover:bg-[#123A6D] hover:text-white active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60 sm:flex-none';

function formatTime(hour: number) {
  const h = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${ampm}`;
}

function normalizeTime(value: string) {
  const parts = String(value).trim().split(':');
  if (parts.length < 2) return value;
  const hour = parts[0]?.padStart(2, '0') ?? '00';
  const minute = parts[1]?.padStart(2, '0') ?? '00';
  return `${hour}:${minute}:00`;
}

function slotHourKey(slot: Pick<TimetableSlot, 'day_of_week' | 'start_time'>) {
  return `${slot.day_of_week}|${normalizeTime(slot.start_time)}`;
}

function dedupeSlotsByCourse(slots: TimetableSlot[]) {
  const byCourse = new Map<string, TimetableSlot>();
  for (const slot of slots) {
    byCourse.set(slot.course_id, slot);
  }
  return [...byCourse.values()];
}

function dedupeAllocations(allocs: Allocation[]) {
  const byCourse = new Map<string, Allocation>();
  for (const alloc of allocs) {
    if (!byCourse.has(alloc.course_id)) {
      byCourse.set(alloc.course_id, alloc);
    }
  }
  return [...byCourse.values()];
}

export default function FacultyScheduleClassesPage() {
  const api = useAuthedApi();
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [gridSlots, setGridSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [focusedSlotId, setFocusedSlotId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ allocations: Allocation[]; timetables: any[]; faculty: any[] }>(
        withTeachingDeptId('/api/academics/faculty/workspaces/timetable/schedule-data', activeDeptId),
      );
      const demo = facultyDemoScheduleData();
      const allocationsResolved = withFacultyDemoFallback(
        data.allocations || [],
        demo.allocations as Allocation[],
        isEmptyArray,
      );
      setAllocations(allocationsResolved);

      const mappedTimetables: TimetableSlot[] = dedupeSlotsByCourse(
        withFacultyDemoFallback(data.timetables || [], demo.timetables, isEmptyArray).map((t) => ({
          timetable_id: t.timetable_id,
          course_id: t.course_id,
          faculty_user_id: t.faculty_user_id,
          course_code: t.course_code,
          course_name: t.course_name,
          faculty_name: t.faculty_name,
          day_of_week: t.day_of_week,
          start_time: normalizeTime(t.start_time),
          end_time: normalizeTime(t.end_time),
          room: t.room,
          section: t.section,
        })),
      );
      let nextSlots = mappedTimetables;
      if (mappedTimetables.some((s) => isFacultyDemoEntityId(s.course_id))) {
        try {
          const raw = sessionStorage.getItem('faculty-demo-schedule-slots');
          if (raw) {
            const parsed = JSON.parse(raw) as TimetableSlot[];
            if (Array.isArray(parsed) && parsed.length) {
              nextSlots = dedupeSlotsByCourse(
                parsed.map((t) => ({
                  ...t,
                  start_time: normalizeTime(t.start_time),
                  end_time: normalizeTime(t.end_time),
                })),
              );
            }
          }
        } catch {
          // ignore
        }
      }
      setGridSlots(nextSlots);
    } catch (e) {
      const demo = facultyDemoScheduleData();
      const allocationsResolved = withFacultyDemoFallback(
        [],
        demo.allocations as Allocation[],
        isEmptyArray,
      );
      setAllocations(allocationsResolved);
      setGridSlots(
        dedupeSlotsByCourse(
          withFacultyDemoFallback([], demo.timetables, isEmptyArray).map((t) => ({
            timetable_id: t.timetable_id,
            course_id: t.course_id,
            faculty_user_id: t.faculty_user_id,
            course_code: t.course_code,
            course_name: t.course_name,
            faculty_name: t.faculty_name,
            day_of_week: t.day_of_week,
            start_time: normalizeTime(t.start_time),
            end_time: normalizeTime(t.end_time),
            room: t.room,
            section: t.section,
          })),
        ),
      );
      if (allocationsResolved.length === 0) {
        toast.error(e instanceof Error ? e.message : 'Failed to load schedule data');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (deptLoading) return;
    void load();
  }, [api, activeDeptId, deptLoading]);

  const uniqueAllocations = useMemo(() => dedupeAllocations(allocations), [allocations]);
  const scheduledCourseIds = useMemo(
    () => new Set(gridSlots.map((s) => s.course_id)),
    [gridSlots],
  );
  const unscheduled = useMemo(
    () => uniqueAllocations.filter((a) => !scheduledCourseIds.has(a.course_id)),
    [uniqueAllocations, scheduledCourseIds],
  );
  const scheduledCount = dedupeSlotsByCourse(gridSlots).length;

  function placeCourse(allocation: Allocation, dayOfWeek: number, hour: number) {
    if (hour === LUNCH_HOUR) return;
    const start_time = `${hour.toString().padStart(2, '0')}:00:00`;
    const end_time = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

    if (gridSlots.some((s) => s.course_id === allocation.course_id)) {
      toast.warning('Course already scheduled', {
        description: `${allocation.course_code} already has a weekly slot. Move or remove it first.`,
      });
      return;
    }
    if (gridSlots.some((s) => slotHourKey(s) === `${dayOfWeek}|${start_time}`)) {
      toast.warning('Time slot taken', {
        description: 'You already have another class at this time.',
      });
      return;
    }

    const newSlot: TimetableSlot = {
      timetable_id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      course_id: allocation.course_id,
      faculty_user_id: allocation.faculty_user_id,
      course_code: allocation.course_code,
      course_name: allocation.course_name,
      faculty_name: allocation.faculty_name,
      day_of_week: dayOfWeek,
      start_time,
      end_time,
      room: '',
      section: 'A',
    };
    setGridSlots((prev) => [...prev, newSlot]);
    setSelectedCourseId(null);
    setFocusedSlotId(newSlot.timetable_id ?? null);
    toast.success(`${allocation.course_code} placed on ${DOW[dayOfWeek]} ${formatTime(hour)}`);
  }

  function handleDragStart(e: React.DragEvent, sourceData: unknown) {
    e.dataTransfer.setData('application/json', JSON.stringify(sourceData));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, dayOfWeek: number, hour: number) {
    e.preventDefault();
    setDragOverKey(null);
    if (hour === LUNCH_HOUR) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const start_time = `${hour.toString().padStart(2, '0')}:00:00`;
      const end_time = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

      if (data.type === 'NEW') {
        placeCourse(data.allocation as Allocation, dayOfWeek, hour);
      } else if (data.type === 'MOVE') {
        const moving = data.slot as TimetableSlot;
        const targetKey = `${dayOfWeek}|${start_time}`;
        if (gridSlots.some((s) => s !== moving && slotHourKey(s) === targetKey)) {
          toast.warning('Time slot taken', {
            description: 'You already have another class at this time.',
          });
          return;
        }
        setGridSlots((prev) =>
          prev.map((s) => {
            if (
              s === data.slot ||
              (s.day_of_week === data.slot.day_of_week &&
                s.start_time === data.slot.start_time &&
                s.course_id === data.slot.course_id)
            ) {
              return { ...s, day_of_week: dayOfWeek, start_time, end_time };
            }
            return s;
          }),
        );
        setFocusedSlotId(moving.timetable_id ?? null);
      }
    } catch (err) {
      console.error('Drop error', err);
    }
  }

  function handleCellClick(dayOfWeek: number, hour: number) {
    if (hour === LUNCH_HOUR || !selectedCourseId) return;
    const allocation = uniqueAllocations.find((a) => a.course_id === selectedCourseId);
    if (!allocation) return;
    placeCourse(allocation, dayOfWeek, hour);
  }

  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  }

  function removeSlot(slotToRemove: TimetableSlot) {
    setGridSlots((prev) => prev.filter((s) => s !== slotToRemove));
    if (focusedSlotId && focusedSlotId === slotToRemove.timetable_id) {
      setFocusedSlotId(null);
    }
  }

  function updateRoom(slotId: string | undefined, room: string) {
    if (!slotId) return;
    setGridSlots((prev) => prev.map((s) => (s.timetable_id === slotId ? { ...s, room } : s)));
  }

  function updateSection(slotId: string | undefined, section: string) {
    if (!slotId) return;
    setGridSlots((prev) =>
      prev.map((s) => (s.timetable_id === slotId ? { ...s, section } : s)),
    );
  }

  async function openRoomModal(slot: TimetableSlot) {
    if (!slot.timetable_id) return;
    setActiveSlotId(slot.timetable_id);
    setFocusedSlotId(slot.timetable_id);
    setRoomModalOpen(true);
    setLoadingRooms(true);
    try {
      const data = await api.get<any[]>(
        `/api/academics/faculty/workspaces/timetable/rooms/availability?day=${slot.day_of_week}&startTime=${slot.start_time}&endTime=${slot.end_time}`,
      );

      const localOccupied = new Set(
        gridSlots
          .filter(
            (s) =>
              s.timetable_id !== slot.timetable_id &&
              s.day_of_week === slot.day_of_week &&
              s.start_time === slot.start_time &&
              s.room,
          )
          .map((s) => s.room),
      );

      const processedData = data.map((r) => ({
        ...r,
        available: r.available && !localOccupied.has(r.roomName),
      }));

      setAvailableRooms(processedData);
    } catch {
      toast.error('Failed to load available rooms');
    } finally {
      setLoadingRooms(false);
    }
  }

  function selectRoom(roomName: string) {
    updateRoom(activeSlotId || undefined, roomName);
    setRoomModalOpen(false);
  }

  async function handleBatchSave() {
    const slots = dedupeSlotsByCourse(gridSlots).map((s) => ({
      ...s,
      start_time: normalizeTime(s.start_time),
      end_time: normalizeTime(s.end_time),
    }));
    const seenTimes = new Set<string>();
    for (const slot of slots) {
      const key = slotHourKey(slot);
      if (seenTimes.has(key)) {
        toast.warning('Conflict detected', {
          description: `You have more than one class at ${DOW[slot.day_of_week]} ${String(slot.start_time).slice(0, 5)}.`,
        });
        return;
      }
      seenTimes.add(key);
    }

    if (slots.some((s) => isFacultyDemoEntityId(s.course_id))) {
      try {
        sessionStorage.setItem('faculty-demo-schedule-slots', JSON.stringify(slots));
      } catch {
        // ignore
      }
      setGridSlots(slots);
      toast.success('Timetable saved locally (demo courses)');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/academics/faculty/workspaces/timetable/slots', {
        slots: slots.map((s) => ({
          course_id: s.course_id,
          faculty_user_id: s.faculty_user_id,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          room: s.room,
          section: s.section,
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

  if (loading) {
    return (
      <FacultyPageShell>
        <FacultyPageHeader title="Class Schedule" description="Loading timetable data…" meta={null} />
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Class Schedule"
        description="Build your weekly timetable in two steps: pick a course, then place it on a free slot. You can also drag and drop."
        meta={
          <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto">
            <div className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold', actionBtnClass)}>
              <span>Courses</span>
              <span className="tabular-nums">{uniqueAllocations.length}</span>
            </div>
            <div className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold', actionBtnClass)}>
              <span>Scheduled</span>
              <span className="tabular-nums">{scheduledCount}</span>
            </div>
            <Button onClick={handleBatchSave} disabled={saving} className={actionBtnClass}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Timetable
            </Button>
          </div>
        }
      />

      {selectedCourseId ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sgvu-gold/40 bg-sgvu-gold/10 px-3 py-2.5 text-sm text-sgvu-navy">
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-sgvu-gold" />
            Course selected — tap any free timetable cell to place it.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedCourseId(null)}
            className="border-sgvu-navy/20"
          >
            Cancel selection
          </Button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        {/* Timetable */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-slate-50/80 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-sgvu-navy">Weekly grid</h2>
              <p className="text-[11px] text-muted-foreground">
                {selectedCourseId
                  ? 'Days down, times across — tap a free cell to place your course'
                  : 'Days as rows, times as columns — drag or select a course first'}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            {/* Days as rows (vertical), times as columns (horizontal) */}
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-16 border-b border-r bg-slate-50 p-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Day
                  </th>
                  {HOURS.map((hour) => (
                    <th
                      key={hour}
                      className={cn(
                        'border-b border-r p-2 text-center text-[10px] font-bold uppercase tracking-wider',
                        hour === LUNCH_HOUR
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-slate-50 text-sgvu-navy',
                      )}
                    >
                      {hour === LUNCH_HOUR ? 'Lunch' : formatTime(hour)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day.val}>
                    <td className="sticky left-0 z-10 border-b border-r bg-slate-50 p-2 text-center align-middle text-xs font-bold text-sgvu-navy">
                      {day.label}
                    </td>
                    {HOURS.map((hour) => {
                      const isLunch = hour === LUNCH_HOUR;
                      const timeStr = `${hour.toString().padStart(2, '0')}:00:00`;
                      const cellKey = `${day.val}-${hour}`;

                      if (isLunch) {
                        return (
                          <td
                            key={cellKey}
                            className="border-b border-r bg-slate-100/80 p-1 text-center align-middle text-[9px] font-bold uppercase tracking-wider text-slate-400"
                          >
                            —
                          </td>
                        );
                      }

                      const slotsInCell = gridSlots.filter(
                        (s) =>
                          s.day_of_week === day.val && normalizeTime(s.start_time) === timeStr,
                      );
                      const isEmpty = slotsInCell.length === 0;
                      const isOver = dragOverKey === cellKey;

                      return (
                        <td
                          key={cellKey}
                          className={cn(
                            'relative h-[5rem] min-w-[6.5rem] border-b border-r p-1 align-top transition',
                            isEmpty && 'cursor-pointer',
                            isOver && 'bg-sgvu-gold/15',
                            selectedCourseId && isEmpty && 'hover:bg-sgvu-navy/5',
                          )}
                          onDragOver={(e) => handleDragOver(e, cellKey)}
                          onDragLeave={() => setDragOverKey((k) => (k === cellKey ? null : k))}
                          onDrop={(e) => handleDrop(e, day.val, hour)}
                          onClick={() => handleCellClick(day.val, hour)}
                        >
                          {isEmpty ? (
                            <div
                              className={cn(
                                'flex h-full min-h-[4.5rem] items-center justify-center rounded-lg border border-dashed text-[10px] font-medium transition',
                                isOver || selectedCourseId
                                  ? 'border-sgvu-gold bg-sgvu-gold/10 text-sgvu-navy'
                                  : 'border-transparent text-transparent hover:border-sgvu-navy/20 hover:text-muted-foreground',
                              )}
                            >
                              {selectedCourseId || isOver ? 'Drop / tap' : '·'}
                            </div>
                          ) : (
                            <div className="flex h-full flex-col gap-1">
                              {slotsInCell.map((slot) => {
                                const focused = focusedSlotId === slot.timetable_id;
                                return (
                                  <div
                                    key={
                                      slot.timetable_id ??
                                      `${slot.course_id}-${slot.day_of_week}-${slot.start_time}`
                                    }
                                    draggable
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      handleDragStart(e, { type: 'MOVE', slot });
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFocusedSlotId(slot.timetable_id ?? null);
                                    }}
                                    className={cn(
                                      'group relative flex h-[4.5rem] flex-col justify-between rounded-lg p-1.5 text-[10px] leading-tight shadow-sm transition',
                                      'cursor-grab active:cursor-grabbing',
                                      focused
                                        ? 'bg-sgvu-gold text-sgvu-navy ring-2 ring-sgvu-gold/60'
                                        : 'bg-sgvu-navy text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy',
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeSlot(slot);
                                      }}
                                      className={cn(
                                        'absolute right-1 top-1 rounded-full p-0.5 opacity-0 transition group-hover:opacity-100',
                                        focused ? 'bg-sgvu-navy/10 text-sgvu-navy' : 'bg-white/15 text-white',
                                      )}
                                      title="Remove slot"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                    <div className="pr-4">
                                      <p className="truncate font-bold">{slot.course_code}</p>
                                      <p className="truncate opacity-80">{slot.course_name}</p>
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateSection(
                                            slot.timetable_id,
                                            slot.section === 'A' ? 'B' : slot.section === 'B' ? 'C' : 'A',
                                          );
                                        }}
                                        className={cn(
                                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold transition',
                                          focused
                                            ? 'bg-sgvu-navy/10 hover:bg-sgvu-navy/20'
                                            : 'bg-white/10 hover:bg-white/25',
                                        )}
                                        title="Cycle section A → B → C"
                                      >
                                        {slot.section || 'A'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void openRoomModal(slot);
                                        }}
                                        className={cn(
                                          'h-6 min-w-0 flex-1 truncate rounded-md px-1.5 text-[9px] font-medium transition',
                                          focused
                                            ? 'bg-sgvu-navy/10 hover:bg-sgvu-navy/20'
                                            : 'bg-white/10 hover:bg-white/25',
                                        )}
                                        title={slot.room || 'Select room'}
                                      >
                                        {slot.room || '+ Room'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Course pool */}
        <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-72">
          <div className="flex max-h-[520px] flex-col overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm">
            <div className="border-b border-border/50 bg-slate-50/80 px-4 py-3">
              <h3 className="text-sm font-bold text-sgvu-navy">My Courses</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Tap to select, then tap a free cell — or drag into the grid.
              </p>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {unscheduled.length === 0 && uniqueAllocations.length > 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-4 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />
                  <p className="mt-2 text-sm font-semibold text-emerald-900">All courses placed</p>
                  <p className="mt-1 text-[11px] text-emerald-800/90">
                    Assign rooms on each card, then save.
                  </p>
                </div>
              ) : null}
              {uniqueAllocations.length === 0 ? (
                <FacultyEmptyState
                  title="No allocated courses"
                  description="Ask your HOD to allocate courses before scheduling."
                />
              ) : (
                <>
                  {unscheduled.length > 0 ? (
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Needs a slot ({unscheduled.length})
                    </p>
                  ) : null}
                  {unscheduled.map((alloc) => {
                    const selected = selectedCourseId === alloc.course_id;
                    return (
                      <button
                        key={alloc.allocation_id}
                        type="button"
                        draggable
                        onDragStart={(e) => handleDragStart(e, { type: 'NEW', allocation: alloc })}
                        onClick={() =>
                          setSelectedCourseId((id) => (id === alloc.course_id ? null : alloc.course_id))
                        }
                        className={cn(
                          'flex w-full items-center gap-2 rounded-xl border p-2.5 text-left shadow-sm transition',
                          'cursor-grab active:cursor-grabbing',
                          selected
                            ? 'border-sgvu-gold bg-sgvu-gold text-sgvu-navy ring-2 ring-sgvu-gold/50'
                            : 'border-border/60 bg-white hover:border-sgvu-navy/30 hover:bg-sgvu-navy/[0.03] active:bg-sgvu-gold active:text-sgvu-navy',
                        )}
                      >
                        <GripVertical
                          className={cn('h-4 w-4 shrink-0', selected ? 'text-sgvu-navy/50' : 'text-slate-300')}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{alloc.course_code}</p>
                          <p className={cn('truncate text-[11px]', selected ? 'opacity-80' : 'text-muted-foreground')}>
                            {alloc.course_name}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {scheduledCount > 0 ? (
                    <>
                      <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Already scheduled ({scheduledCount})
                      </p>
                      {uniqueAllocations
                        .filter((a) => scheduledCourseIds.has(a.course_id))
                        .map((alloc) => {
                          const slot = gridSlots.find((s) => s.course_id === alloc.course_id);
                          return (
                            <div
                              key={alloc.allocation_id}
                              className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2"
                            >
                              <p className="truncate text-sm font-bold text-sgvu-navy">{alloc.course_code}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {slot
                                  ? `${DOW[slot.day_of_week]} · ${formatTime(Number(String(slot.start_time).slice(0, 2)))}`
                                  : 'Scheduled'}
                                {slot?.room ? ` · ${slot.room}` : ''}
                              </p>
                            </div>
                          );
                        })}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={roomModalOpen} onOpenChange={setRoomModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Room</DialogTitle>
          </DialogHeader>
          <div className="max-h-[500px] min-w-0 overflow-x-auto overflow-y-auto">
            {loadingRooms ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
              </div>
            ) : (
              <table className="w-full min-w-[480px] border-collapse">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="border-b p-2 text-left text-sm font-semibold">Room Name</th>
                    <th className="border-b p-2 text-left text-sm font-semibold">Capacity</th>
                    <th className="border-b p-2 text-left text-sm font-semibold">Status</th>
                    <th className="border-b p-2 text-right text-sm font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="p-2 text-sm font-medium">{r.roomName}</td>
                      <td className="p-2 text-sm text-slate-500">{r.capacity || 'N/A'}</td>
                      <td className="p-2 text-sm">
                        {r.available ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                            Available
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            Unavailable
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          disabled={!r.available}
                          className={actionBtnClass}
                          onClick={() => selectRoom(r.roomName)}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {availableRooms.length === 0 && !loadingRooms ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No rooms configured.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
