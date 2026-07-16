'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CalendarEvent = {
  event_id: string;
  source?: string;
  title: string;
  event_type: string;
  event_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  color_code?: string;
  description?: string | null;
  department?: string | null;
  semester?: number | null;
};

const TYPE_COLORS: Record<string, string> = {
  MID_SEMESTER: 'bg-blue-100 text-blue-800 border-blue-200',
  END_SEMESTER: 'bg-sgvu-navy/10 text-sgvu-navy border-sgvu-navy/20',
  PRACTICAL: 'bg-purple-100 text-purple-800 border-purple-200',
  VIVA: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  HOLIDAY: 'bg-red-100 text-red-800 border-red-200',
  HALL_TICKET_RELEASE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  RESULT_DECLARATION: 'bg-amber-100 text-amber-800 border-amber-200',
  REVALUATION: 'bg-orange-100 text-orange-800 border-orange-200',
  SUPPLEMENTARY: 'bg-teal-100 text-teal-800 border-teal-200',
  DEADLINE: 'bg-rose-100 text-rose-800 border-rose-200',
  ACADEMIC: 'bg-slate-100 text-slate-800 border-slate-200',
  OTHER: 'bg-gray-100 text-gray-800 border-gray-200',
};

type ViewMode = 'month' | 'week' | 'list';

interface ExamCalendarProps {
  events: CalendarEvent[];
  onReschedule?: (eventId: string, newDate: string) => void;
  draggable?: boolean;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function ExamCalendar({ events, onReschedule, draggable }: ExamCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [dragEventId, setDragEventId] = useState<string | null>(null);

  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const monthDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const total = daysInMonth(cursor);
    const startPad = first.getDay();
    const cells: Array<{ date: string | null; day?: number }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null });
    for (let d = 1; d <= total; d++) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date: iso, day: d });
    }
    return cells;
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = String(e.event_date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const weekDates = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [cursor]);

  function handleDrop(date: string) {
    if (dragEventId && onReschedule && draggable) {
      onReschedule(dragEventId, date);
      setDragEventId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center font-semibold text-sgvu-navy">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {(['month', 'week', 'list'] as ViewMode[]).map((v) => (
            <Button key={v} size="sm" variant={view === v ? 'default' : 'ghost'} className={view === v ? 'bg-sgvu-navy' : ''} onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="p-2 text-center font-semibold text-muted-foreground">{d}</div>
          ))}
          {monthDays.map((cell, i) => {
            const dayEvents = cell.date ? eventsByDate.get(cell.date) ?? [] : [];
            const isToday = cell.date === new Date().toISOString().slice(0, 10);
            return (
              <div
                key={i}
                className={cn(
                  'min-h-[88px] rounded-lg border p-1 transition',
                  cell.date ? 'bg-white hover:border-sgvu-gold/40' : 'bg-transparent border-transparent',
                  isToday && 'ring-2 ring-sgvu-gold/50',
                )}
                onDragOver={(e) => draggable && cell.date && e.preventDefault()}
                onDrop={() => cell.date && handleDrop(cell.date)}
              >
                {cell.day ? <p className="mb-1 text-[10px] font-bold text-muted-foreground">{cell.day}</p> : null}
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.event_id}
                      draggable={draggable && ev.source === 'CALENDAR'}
                      onDragStart={() => setDragEventId(ev.event_id)}
                      className={cn('truncate rounded border px-1 py-0.5 text-[9px] font-medium', TYPE_COLORS[ev.event_type] ?? TYPE_COLORS.OTHER)}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 ? <p className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {view === 'week' ? (
        <div className="grid gap-2 md:grid-cols-7">
          {weekDates.map((date) => (
            <div key={date} className="rounded-lg border p-2">
              <p className="text-xs font-semibold text-sgvu-navy">{new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</p>
              <div className="mt-2 space-y-1">
                {(eventsByDate.get(date) ?? []).map((ev) => (
                  <div key={ev.event_id} className={cn('rounded border px-2 py-1 text-[10px]', TYPE_COLORS[ev.event_type] ?? TYPE_COLORS.OTHER)}>
                    {ev.title}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === 'list' ? (
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No calendar events in this range.</p>
          ) : events.map((ev) => (
            <div key={ev.event_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div>
                <p className="font-medium text-sm">{ev.title}</p>
                <p className="text-xs text-muted-foreground">{String(ev.event_date).slice(0, 10)}{ev.start_time ? ` · ${String(ev.start_time).slice(0, 5)}` : ''}</p>
              </div>
              <Badge variant="outline" className={TYPE_COLORS[ev.event_type]}>{ev.event_type.replace(/_/g, ' ')}</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
