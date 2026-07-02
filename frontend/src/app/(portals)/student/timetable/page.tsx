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
              <div className="min-w-[900px]">
                {/* Header Row */}
                <div className="flex border-b border-border/60">
                  <div className="w-16 shrink-0" />
                  {DAYS.map((day) => (
                    <div key={day.id} className="flex-1 py-2 text-center text-sm font-semibold text-sgvu-navy">
                      {day.label}
                    </div>
                  ))}
                </div>

                <div className="relative" style={{ height: '480px' }}>
                  {/* Grid Lines */}
                  {HOURS.map((hour, i) => (
                    <div
                      key={hour.time}
                      className={cn(
                        "absolute left-0 right-0",
                        i > 0 && "border-t border-border/40"
                      )}
                      style={{ top: `${(i / (HOURS.length - 1)) * 100}%` }}
                    >
                      <span className="absolute -top-3 left-0 w-16 text-right text-xs font-medium text-muted-foreground pr-2">
                        {hour.label}
                      </span>
                    </div>
                  ))}

                  {/* Lunch Block */}
                  <div
                    className="absolute left-20 right-0 flex items-center justify-center border-y border-dashed border-sgvu-gold/30 bg-sgvu-gold/5"
                    style={{
                      top: `${((13 * 60 - START_MINUTES) / TOTAL_MINUTES) * 100}%`,
                      height: `${(60 / TOTAL_MINUTES) * 100}%`,
                      zIndex: 0,
                    }}
                  >
                    <span className="text-sm font-bold tracking-widest text-sgvu-gold/60 uppercase">
                      Lunch Break
                    </span>
                  </div>

                  {/* Classes */}
                  <div className="absolute inset-0 left-20 flex">
                    {DAYS.map((day) => {
                      const daySlots = slotsByDay.get(day.id) ?? [];
                      return (
                        <div key={day.id} className="relative flex-1 border-l border-border/20 first:border-l-0">
                          {daySlots.map((slot) => {
                            const start = timeToMinutes(slot.start_time.slice(0, 5));
                            const end = timeToMinutes(slot.end_time.slice(0, 5));
                            if (start < START_MINUTES || end > END_MINUTES) return null;
                            const top = ((start - START_MINUTES) / TOTAL_MINUTES) * 100;
                            const height = ((end - start) / TOTAL_MINUTES) * 100;

                            return (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={slot.timetable_id}
                                className={cn(
                                  'absolute inset-x-1 overflow-hidden rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md',
                                  slot.is_virtual ? 'border-blue-200 bg-blue-50/50' : 'border-sgvu-navy/10 bg-white'
                                )}
                                style={{ top: `${top}%`, height: `${height}%`, zIndex: 10 }}
                              >
                                <div className="flex h-full flex-col">
                                  <p className="line-clamp-2 text-sm font-bold leading-tight text-sgvu-navy">
                                    {slot.course_name}
                                  </p>
                                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                                    {slot.course_code}
                                  </p>
                                  <div className="mt-auto space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <Clock className="h-3.5 w-3.5 shrink-0" />
                                      {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                                      {slot.room ?? 'TBA'}
                                    </div>
                                    {slot.faculty_name && (
                                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                        <User className="h-3.5 w-3.5 shrink-0" />
                                        {slot.faculty_name}
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
