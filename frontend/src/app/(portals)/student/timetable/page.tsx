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

const HOURS = [
  { time: '09:00', label: '9 AM' },
  { time: '10:00', label: '10 AM' },
  { time: '11:00', label: '11 AM' },
  { time: '12:00', label: '12 PM' },
  { time: '13:00', label: '1 PM' },
  { time: '14:00', label: '2 PM' },
  { time: '15:00', label: '3 PM' },
  { time: '16:00', label: '4 PM' },
  { time: '17:00', label: '5 PM' },
];

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

const START_MINUTES = 9 * 60; // 9:00 AM
const END_MINUTES = 17 * 60; // 5:00 PM
const TOTAL_MINUTES = END_MINUTES - START_MINUTES;

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
              <div className="min-w-[900px] rounded-2xl border border-border bg-slate-50/40">
                {/* Header Row */}
                <div className="flex border-b border-border bg-white rounded-t-2xl">
                  <div className="w-16 shrink-0" />
                  {DAYS.map((day) => (
                    <div key={day.id} className="flex-1 py-3 text-center text-sm font-bold text-sgvu-navy">
                      {day.label}
                    </div>
                  ))}
                </div>

                <div className="relative" style={{ height: '560px' }}>
                  {/* Grid Lines */}
                  {HOURS.map((hour, i) => (
                    <div
                      key={hour.time}
                      className={cn(
                        "absolute left-0 right-0",
                        i > 0 && "border-t border-border/60 border-dashed"
                      )}
                      style={{ top: `${(i / (HOURS.length - 1)) * 100}%` }}
                    >
                      <span className="absolute -top-2.5 left-0 w-16 text-right text-xs font-semibold text-slate-400 pr-3">
                        {hour.label}
                      </span>
                    </div>
                  ))}

                  {/* Lunch Block */}
                  <div
                    className="absolute left-16 right-0 flex items-center justify-center border-y border-amber-200/50 bg-amber-50/40 backdrop-blur-sm"
                    style={{
                      top: `${((13 * 60 - START_MINUTES) / TOTAL_MINUTES) * 100}%`,
                      height: `${(60 / TOTAL_MINUTES) * 100}%`,
                      zIndex: 0,
                    }}
                  >
                    <span className="text-xs font-bold tracking-widest text-amber-600/50 uppercase">
                      Lunch Break
                    </span>
                  </div>

                  {/* Classes */}
                  <div className="absolute inset-0 left-16 flex">
                    {DAYS.map((day) => {
                      const daySlots = slotsByDay.get(day.id) ?? [];
                      return (
                        <div key={day.id} className="relative flex-1 border-l border-border/40 first:border-l-0">
                          {daySlots.map((slot) => {
                            const start = timeToMinutes(slot.start_time.slice(0, 5));
                            const end = timeToMinutes(slot.end_time.slice(0, 5));
                            if (start < START_MINUTES || end > END_MINUTES) return null;
                            const top = ((start - START_MINUTES) / TOTAL_MINUTES) * 100;
                            const height = ((end - start) / TOTAL_MINUTES) * 100;

                            return (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={slot.timetable_id}
                                className={cn(
                                  'absolute inset-x-1 overflow-hidden rounded-xl shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 group',
                                  slot.is_virtual 
                                    ? 'border border-blue-200 bg-blue-50/80' 
                                    : 'border-l-4 border-l-sgvu-navy border-y border-r border-border/60 bg-white'
                                )}
                                style={{ top: `calc(${top}% + 2px)`, height: `calc(${height}% - 4px)`, zIndex: 10 }}
                              >
                                <div className="flex h-full flex-col p-2.5">
                                  <p className="line-clamp-2 text-xs font-bold leading-tight text-sgvu-navy group-hover:text-sgvu-gold transition-colors">
                                    {slot.course_name}
                                  </p>
                                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                    {slot.course_code}
                                  </p>
                                  <div className="mt-auto space-y-1">
                                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                                      <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                                      {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                                      <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                      {slot.room ?? 'TBA'}
                                    </div>
                                    {slot.faculty_name && (
                                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                                        <User className="h-3 w-3 shrink-0 text-slate-400" />
                                        <span className="truncate">{slot.faculty_name}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
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
