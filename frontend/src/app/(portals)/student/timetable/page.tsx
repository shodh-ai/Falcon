'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Clock, MapPin, User, Video } from 'lucide-react';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { useAuthedApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type TimetableSlot = {
  timetable_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  room: string | null;
  faculty_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_virtual: boolean;
  live_join_url: string | null;
};

const DAYS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;

function formatTime(hour: number) {
  const h = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${ampm}`;
}



export default function TimetablePage() {
  const api = useAuthedApi();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<TimetableSlot[]>('/api/academics/dashboard/timetable/weekly');
        setSlots(data);
      } catch (e) {
        console.error('Failed to load timetable', e);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [api]);

  const slotsByDay = useMemo(() => {
    const map = new Map<number, TimetableSlot[]>();
    DAYS.forEach((d) => map.set(d.id, []));
    slots.forEach((s) => {
      if (map.has(s.day_of_week)) {
        map.get(s.day_of_week)!.push(s);
      }
    });
    return map;
  }, [slots]);

  return (
    <StudentPageShell>
      <section className="mb-4 overflow-hidden rounded-[2rem] border border-sgvu-navy/10 bg-gradient-to-br from-sgvu-navy via-sgvu-navy to-slate-900 p-5 text-white shadow-xl shadow-sgvu-navy/15 md:p-6">
        <div className="relative">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sgvu-gold/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Weekly Timetable</h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-white/75">
              Your class schedule for the week.
            </p>
          </div>
        </div>
      </section>

      <StudentSectionCard title="Schedule" icon={CalendarDays}>
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Loading timetable...
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden lg:block relative overflow-x-auto pb-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Time</th>
                      {DAYS.map(day => (
                        <th key={day.id} className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-sgvu-navy uppercase tracking-wider text-center w-24">
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
                              Lunch Break
                            </td>
                          ) : (
                            DAYS.map(day => {
                              const daySlots = slotsByDay.get(day.id) ?? [];
                              const slotsInCell = daySlots.filter(s => s.start_time === timeStr);
                              return (
                                <td
                                  key={`${day.id}-${hour}`}
                                  className="p-1 border-b border-r h-14 align-top relative min-w-[90px]"
                                >
                                  <div className="absolute inset-0 z-0 p-0.5">
                                    <div className="w-full h-full border rounded transition-colors" />
                                  </div>
                                  <div className="relative z-10 flex flex-col gap-0.5 w-full h-full">
                                    {slotsInCell.map((slot) => (
                                      <div
                                        key={slot.timetable_id}
                                        className={cn("group text-[9px] rounded p-1 shadow-sm transition-all relative flex flex-col leading-tight", slot.is_virtual ? "bg-blue-50 border-l-2 border-blue-400 text-blue-900" : "bg-sgvu-navy text-white border-l-2 border-sgvu-gold hover:shadow-md")}
                                      >
                                        <span className="font-bold truncate pr-3">{slot.course_code}</span>
                                        {slot.faculty_name && (
                                          <span className="text-[7.5px] font-medium truncate opacity-90 leading-[10px] mt-0.5">{slot.faculty_name}</span>
                                        )}
                                        {slot.room && !slot.is_virtual && (
                                          <span className="text-[7.5px] font-medium truncate opacity-90 leading-[10px] mt-0.5">{slot.room}</span>
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
            </div>

            {/* Mobile View */}
            <div className="lg:hidden mt-4">
              <Tabs defaultValue="1">
                <TabsList className="mb-4 flex w-full overflow-x-auto justify-start">
                  {DAYS.map((day) => (
                    <TabsTrigger key={day.id} value={day.id.toString()} className="min-w-[60px]">
                      {day.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {DAYS.map((day) => {
                  const daySlots = slotsByDay.get(day.id) ?? [];
                  const sorted = [...daySlots].sort((a, b) => a.start_time.localeCompare(b.start_time));
                  return (
                    <TabsContent key={day.id} value={day.id.toString()} className="space-y-3">
                      {sorted.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
                          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground/50" />
                          <p className="text-sm font-medium text-muted-foreground">No classes today</p>
                        </div>
                      ) : (
                        sorted.map((slot) => (
                          <div
                            key={slot.timetable_id}
                            className={cn(
                              'rounded-xl border p-4 shadow-sm',
                              slot.is_virtual ? 'border-blue-200 bg-blue-50/30' : 'bg-white'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-sgvu-navy">{slot.course_name}</p>
                                <p className="text-xs font-medium text-muted-foreground">{slot.course_code}</p>
                              </div>
                              {slot.is_virtual && <Badge variant="secondary">Virtual</Badge>}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span>{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span>{slot.room ?? 'TBA'}</span>
                              </div>
                              {slot.faculty_name && (
                                <div className="col-span-2 flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  <span>{slot.faculty_name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </>
        )}
      </StudentSectionCard>
    </StudentPageShell>
  );
}
