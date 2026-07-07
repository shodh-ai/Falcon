'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, X, GripVertical } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  FacultyPageShell,
  FacultyPageHeader,
  FacultyPanel,
} from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

function formatTime(hour: number) {
  const h = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${ampm}`;
}

export default function FacultyScheduleClassesPage() {
  const api = useAuthedApi();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [gridSlots, setGridSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ allocations: Allocation[]; timetables: any[]; faculty: any[] }>(
        '/api/academics/faculty/workspaces/timetable/schedule-data',
      );
      setAllocations(data.allocations || []);

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
        section: t.section,
      }));
      setGridSlots(mappedTimetables);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule data');
      setAllocations([]);
      setGridSlots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

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
          room: '',
          section: 'A',
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
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function removeSlot(slotToRemove: TimetableSlot) {
    setGridSlots(prev => prev.filter(s => s !== slotToRemove));
  }
  
  function updateRoom(slotId: string | undefined, room: string) {
    if(!slotId) return;
    setGridSlots(prev => prev.map(s => s.timetable_id === slotId ? { ...s, room } : s));
  }

  function updateSection(slotId: string | undefined, section: string) {
    if(!slotId) return;
    setGridSlots(prev => prev.map(s => s.timetable_id === slotId ? { ...s, section } : s));
  }

  async function openRoomModal(slot: TimetableSlot) {
    if (!slot.timetable_id) return;
    setActiveSlotId(slot.timetable_id);
    setRoomModalOpen(true);
    setLoadingRooms(true);
    try {
      const data = await api.get<any[]>(
        `/api/academics/faculty/workspaces/timetable/rooms/availability?day=${slot.day_of_week}&startTime=${slot.start_time}&endTime=${slot.end_time}`
      );
      
      const localOccupied = new Set(
        gridSlots
          .filter(s => s.timetable_id !== slot.timetable_id && s.day_of_week === slot.day_of_week && s.start_time === slot.start_time && s.room)
          .map(s => s.room)
      );

      const processedData = data.map(r => ({
        ...r,
        available: r.available && !localOccupied.has(r.roomName)
      }));

      setAvailableRooms(processedData);
    } catch (e) {
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
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/workspaces/timetable/slots', {
        slots: gridSlots.map(s => ({
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
        <FacultyPageHeader title="Schedule Classes" description="Loading timetable data..." meta={null} />
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Schedule Classes"
        description="Select your preferred time slots for your allocated courses. First come, first serve."
        meta={
          <div className="flex items-center gap-3">
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg border flex gap-2 items-center text-sm">
              <span className="font-semibold text-sgvu-navy">Courses:</span>
              <span>{allocations.length}</span>
            </div>
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg border flex gap-2 items-center text-sm">
              <span className="font-semibold text-sgvu-navy">Scheduled Slots:</span>
              <span>{gridSlots.length}</span>
            </div>
            <Button
              onClick={handleBatchSave}
              disabled={saving}
              className="ml-2 bg-sgvu-gold text-sgvu-navy hover:bg-sgvu-gold-hover hover:shadow-md"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Timetable
            </Button>
          </div>
        }
      />

      <div className="mt-4 flex flex-col xl:flex-row gap-4 mb-8 max-w-full overflow-hidden">
        {/* Left Side: Compact Timetable Grid */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto min-h-[600px]">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Time</th>
                {DAYS.map(day => (
                  <th key={day.val} className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-sgvu-navy uppercase tracking-wider text-center w-32">
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
                        const slotsInCell = gridSlots.filter(s => s.day_of_week === day.val && s.start_time === timeStr);
                        return (
                          <td
                            key={`${day.val}-${hour}`}
                            className="p-1 border-b border-r h-20 align-top relative min-w-[120px]"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, day.val, hour)}
                          >
                            <div className="absolute inset-0 z-0 p-0.5">
                              <div className="w-full h-full border hover:border-sgvu-gold/50 rounded transition-colors" />
                            </div>
                            <div className="relative z-10 flex flex-col gap-1 w-full h-full">
                              {slotsInCell.map((slot, i) => (
                                <div
                                  key={i}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, { type: 'MOVE', slot })}
                                  className="group bg-sgvu-navy text-white text-[10px] rounded p-1.5 shadow-sm cursor-grab active:cursor-grabbing border-l-2 border-sgvu-gold hover:shadow-md transition-all relative flex flex-col leading-tight"
                                >
                                  <button
                                    onClick={() => removeSlot(slot)}
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 rounded-full text-white"
                                    title="Remove slot"
                                  >
                                    <X className="h-3 w-3 p-0.5" />
                                  </button>
                                  <span className="font-bold truncate pr-4">{slot.course_code}</span>
                                  <div className="flex gap-1 mt-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateSection(slot.timetable_id, slot.section === 'A' ? 'B' : 'A');
                                      }}
                                      className="w-5 h-5 flex-shrink-0 bg-white/10 border border-white/20 hover:bg-white/30 rounded text-[10px] font-bold transition-colors flex items-center justify-center cursor-pointer"
                                      title="Toggle Section (Click to change)"
                                    >
                                      {slot.section || 'A'}
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openRoomModal(slot);
                                      }}
                                      className="flex-1 h-5 min-w-0 bg-white/10 border border-white/20 hover:bg-white/30 rounded px-1.5 text-[9px] font-medium truncate transition-colors flex items-center justify-center cursor-pointer"
                                      title={slot.room || 'Select Room'}
                                    >
                                      {slot.room || '+ Room'}
                                    </button>
                                  </div>
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
        <div className="w-full xl:w-64 flex-shrink-0 flex flex-col max-h-[400px]">
          <div className="bg-slate-50 border border-gray-200 rounded-xl flex flex-col h-full overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-white">
              <h3 className="font-bold text-sgvu-navy text-sm">My Courses</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Drag into the timetable slots.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {allocations.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground mt-4">No allocated courses.</div>
              ) : (
                allocations.map(alloc => (
                  <div
                    key={alloc.allocation_id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'NEW', allocation: alloc })}
                    className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm hover:shadow-md hover:border-sgvu-gold transition-all cursor-grab active:cursor-grabbing flex gap-1.5 items-center"
                  >
                    <GripVertical className="h-4 w-4 text-slate-300 flex-shrink-0" />
                    <div className="flex flex-col overflow-hidden w-full">
                      <span className="font-bold text-sgvu-navy text-sm truncate">{alloc.course_code}</span>
                      <span className="text-[10px] text-slate-500 truncate mt-0.5">{alloc.course_name}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={roomModalOpen} onOpenChange={setRoomModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Room</DialogTitle>
          </DialogHeader>
          <div className="max-h-[500px] overflow-y-auto">
            {loadingRooms ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin h-6 w-6 text-sgvu-navy" /></div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-sm font-semibold border-b">Room Name</th>
                    <th className="p-2 text-left text-sm font-semibold border-b">Capacity</th>
                    <th className="p-2 text-left text-sm font-semibold border-b">Status</th>
                    <th className="p-2 text-right text-sm font-semibold border-b">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="p-2 text-sm font-medium">{r.roomName}</td>
                      <td className="p-2 text-sm text-slate-500">{r.capacity || 'N/A'}</td>
                      <td className="p-2 text-sm">
                        {r.available ? (
                          <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-semibold">Available</span>
                        ) : (
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-semibold">Unavailable</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          disabled={!r.available}
                          onClick={() => selectRoom(r.roomName)}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {availableRooms.length === 0 && !loadingRooms && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">No rooms configured.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
