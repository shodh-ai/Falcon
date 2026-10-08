'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import {
  ACADEMIC_EVENT_CATEGORIES,
  categoryMeta,
  daysUntil,
  downloadAcademicCalendarPdf,
  downloadIcsFile,
  formatEventDate,
  formatShortDate,
  googleCalendarUrl,
  isEventOnDate,
  mergeCalendarEvents,
  type AcademicCalendarEvent,
  type AcademicEventCategory,
} from '@/lib/student/academic-calendar';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date; inMonth: boolean; iso: string }> = [];

  for (let i = 0; i < startOffset; i += 1) {
    const d = new Date(year, month, -startOffset + i + 1);
    cells.push({ date: d, inMonth: false, iso: toLocalIso(d) });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month, day);
    cells.push({ date: d, inMonth: true, iso: toLocalIso(d) });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const d = new Date(last.date);
    d.setDate(d.getDate() + 1);
    cells.push({ date: d, inMonth: false, iso: toLocalIso(d) });
  }
  return cells;
}

export function StudentAcademicCalendarWorkspace() {
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const now = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => now.toISOString().slice(0, 10), [now]);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<AcademicCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategories, setActiveCategories] = useState<Set<AcademicEventCategory>>(
    () => new Set(ACADEMIC_EVENT_CATEGORIES.map((c) => c.id)),
  );
  const [selectedEvent, setSelectedEvent] = useState<AcademicCalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(todayIso);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ events: AcademicCalendarEvent[] }>(
        '/api/student/academic-calendar',
      );
      setEvents(mergeCalendarEvents(res.events));
    } catch {
      setEvents(mergeCalendarEvents([]));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const eventId = searchParams.get('event');
    if (!eventId || !events.length) return;
    const found = events.find((e) => e.event_id === eventId);
    if (found) {
      setSelectedEvent(found);
      const d = new Date(`${found.date}T12:00:00`);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(found.date);
    }
  }, [searchParams, events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((event) => {
      if (!activeCategories.has(event.category)) return false;
      if (!q) return true;
      const monthName = new Date(`${event.date}T12:00:00`)
        .toLocaleDateString('en-IN', { month: 'long' })
        .toLowerCase();
      return (
        event.title.toLowerCase().includes(q) ||
        event.category.toLowerCase().includes(q) ||
        categoryMeta(event.category).label.toLowerCase().includes(q) ||
        monthName.includes(q) ||
        (event.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [events, activeCategories, search]);

  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return filteredEvents.filter(
      (e) => e.date.startsWith(prefix) || (e.end_date?.startsWith(prefix) ?? false),
    );
  }, [filteredEvents, year, month]);

  const stats = useMemo(() => {
    const upcoming = filteredEvents.filter((e) => e.date >= todayIso).length;
    const examinations = filteredEvents.filter((e) => e.category === 'EXAMINATION').length;
    const holidays = filteredEvents.filter((e) => e.category === 'HOLIDAYS').length;
    return {
      total: filteredEvents.length,
      upcoming,
      examinations,
      holidays,
    };
  }, [filteredEvents, todayIso]);

  const soonAlerts = useMemo(
    () =>
      filteredEvents
        .map((e) => ({ event: e, days: daysUntil(e.date, now) }))
        .filter((x) => x.days >= 0 && x.days <= 7)
        .sort((a, b) => a.days - b.days)
        .slice(0, 4),
    [filteredEvents, now],
  );

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const dayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return monthEvents.filter((e) => isEventOnDate(e, selectedDay));
  }, [monthEvents, selectedDay]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function toggleCategory(id: AcademicEventCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onDownloadPdf() {
    try {
      await downloadAcademicCalendarPdf(filteredEvents);
      toast.success('Academic calendar PDF downloaded');
    } catch {
      toast.error('Could not generate PDF');
    }
  }

  function onDownloadIcs() {
    downloadIcsFile(filteredEvents);
    toast.success('Calendar file (.ics) downloaded');
  }

  return (
    <StudentPageShell width="full" className="max-w-[1400px]">
      <StudentPageHeader
        title="Calendar"
        description="Simple view of classes, exams, fee dates, festivals, holidays, placements, and campus events — so you always know what is coming."
        eyebrow="Academics"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void onDownloadPdf()}>
              <FileText className="h-4 w-4" />
              Download PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onDownloadIcs}>
              <Download className="h-4 w-4" />
              Save to phone (.ics)
            </Button>
          </div>
        }
      />

      <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">How to read this</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap a coloured day to see details. Red = holiday (no class). Blue = exam. Green = class / registration.
          Gold alerts below mean something important is within 7 days.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ACADEMIC_EVENT_CATEGORIES.map((cat) => (
            <span
              key={cat.id}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', cat.chipClass)}
            >
              <span className={cn('h-2 w-2 rounded-full', cat.dotClass)} />
              {cat.shortLabel}: {cat.studentHint}
            </span>
          ))}
        </div>
      </section>

      {soonAlerts.length > 0 ? (
        <div className="space-y-2">
          {soonAlerts.map(({ event, days }) => (
            <button
              key={event.event_id}
              type="button"
              onClick={() => setSelectedEvent(event)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-sgvu-gold/40 bg-sgvu-gold/15 px-4 py-3 text-left transition hover:bg-sgvu-gold/25"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sgvu-navy">
                  {event.title}{' '}
                  {days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`}
                </p>
                {event.student_tip ? (
                  <p className="mt-0.5 truncate text-xs text-sgvu-navy/70">{event.student_tip}</p>
                ) : null}
              </div>
              <Badge className="shrink-0 border-transparent bg-sgvu-navy text-white">Upcoming</Badge>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StudentStatCard label="All dates" value={stats.total} helper="In your current filters" icon={CalendarDays} />
        <StudentStatCard label="Coming up" value={stats.upcoming} helper="Still ahead from today" tone="gold" />
        <StudentStatCard label="Exam dates" value={stats.examinations} helper="Mid-term, practical, end-term" />
        <StudentStatCard label="Holidays & festivals" value={stats.holidays} helper="Days with no classes" />
      </div>

      <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Try: Diwali, exam, fee, Holi, placement…"
              className="h-11 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ACADEMIC_EVENT_CATEGORIES.map((cat) => {
              const active = activeCategories.has(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    active ? cat.chipClass : 'border-sgvu-navy/10 bg-white text-muted-foreground opacity-60',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', cat.dotClass)} />
                  {cat.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">Monthly view</p>
              <h2 className="text-lg font-black text-sgvu-navy sm:text-xl">{monthLabel(year, month)}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-11 w-11 sm:h-10 sm:w-10" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                onClick={() => {
                  setYear(now.getFullYear());
                  setMonth(now.getMonth());
                  setSelectedDay(todayIso);
                }}
              >
                Today
              </Button>
              <Button size="icon" variant="outline" className="h-11 w-11 sm:h-10 sm:w-10" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 sm:h-24 sm:rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="px-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-muted-foreground sm:px-1 sm:text-[11px]"
                  >
                    <span className="sm:hidden">{d.slice(0, 1)}</span>
                    <span className="hidden sm:inline">{d}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {grid.map((cell) => {
                  if (!cell) return null;
                  const dayEv = monthEvents.filter((e) => isEventOnDate(e, cell.iso));
                  const isToday = cell.iso === todayIso;
                  const isSelected = cell.iso === selectedDay;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelectedDay(cell.iso)}
                      className={cn(
                        'min-h-[3.25rem] rounded-lg border p-1 text-left transition hover:-translate-y-0.5 hover:shadow-sm sm:min-h-[6.5rem] sm:rounded-xl sm:p-2',
                        cell.inMonth ? 'bg-white' : 'bg-slate-50/80 text-muted-foreground',
                        isSelected && 'border-sgvu-navy bg-sgvu-navy/[0.03] ring-1 ring-sgvu-navy/20',
                        !isSelected && 'border-sgvu-navy/10',
                        isToday && 'border-sgvu-gold/60 bg-sgvu-gold/10',
                      )}
                    >
                      <div className="mb-0.5 flex items-center justify-between sm:mb-1">
                        <span
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 sm:text-xs',
                            isToday && 'bg-sgvu-navy text-white',
                          )}
                        >
                          {cell.date.getDate()}
                        </span>
                        {dayEv.length > 0 ? (
                          <span className="text-[9px] font-semibold text-muted-foreground sm:text-[10px]">
                            {dayEv.length}
                          </span>
                        ) : null}
                      </div>
                      {dayEv.length > 0 ? (
                        <div className="mt-0.5 flex justify-center gap-0.5 sm:hidden" aria-hidden>
                          {dayEv.slice(0, 3).map((event) => (
                            <span
                              key={event.event_id}
                              className="h-1 w-1 rounded-full bg-sgvu-navy/50"
                            />
                          ))}
                        </div>
                      ) : null}
                      <div className="hidden space-y-1 sm:block">
                        {dayEv.slice(0, 2).map((event) => {
                          const meta = categoryMeta(event.category);
                          return (
                            <button
                              key={event.event_id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                              }}
                              className={cn(
                                'block w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                                meta.chipClass,
                              )}
                              title={event.title}
                            >
                              {event.title}
                            </button>
                          );
                        })}
                        {dayEv.length > 2 ? (
                          <p className="text-[10px] font-medium text-muted-foreground">+{dayEv.length - 2} more</p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-sgvu-navy">
              {selectedDay ? formatEventDate(selectedDay) : 'Select a date'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Events on the selected day</p>
            <div className="mt-4 space-y-2">
              {!loading && dayEvents.length === 0 ? (
                <StudentEmptyState
                  title="No academic events scheduled for this period."
                  description="Try another date or clear filters."
                  className="py-8"
                />
              ) : (
                dayEvents.map((event) => {
                  const meta = categoryMeta(event.category);
                  return (
                    <button
                      key={event.event_id}
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className="w-full rounded-xl border border-sgvu-navy/10 bg-slate-50/80 p-3 text-left transition hover:border-sgvu-gold/40 hover:bg-sgvu-gold/5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-sgvu-navy">{event.title}</p>
                        <Badge className={cn('border text-[10px]', meta.badgeClass)}>{meta.shortLabel}</Badge>
                      </div>
                      {event.venue ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {event.venue}
                        </p>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-sgvu-navy/10 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-sgvu-navy">This month at a glance</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              All festivals, exams, and important dates in {monthLabel(year, month)}
            </p>
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {monthEvents.length === 0 ? (
                <li className="text-sm text-muted-foreground">Nothing in this month for your filters.</li>
              ) : (
                monthEvents.map((event) => {
                  const meta = categoryMeta(event.category);
                  return (
                    <li key={`${event.event_id}-list`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(event.date);
                          setSelectedEvent(event);
                        }}
                        className="flex w-full items-start justify-between gap-2 rounded-xl border border-sgvu-navy/10 bg-slate-50/80 px-3 py-2 text-left transition hover:border-sgvu-gold/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-sgvu-navy">{event.title}</p>
                          <p className="text-[11px] text-muted-foreground">{meta.shortLabel}</p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-sgvu-navy">
                          {formatShortDate(event.date)}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </aside>
      </div>

      {!loading && monthEvents.length === 0 ? (
        <StudentEmptyState
          title="No academic events scheduled for this period."
          description="Try another month, search Diwali / exam / fee, or turn category filters back on."
        />
      ) : null}

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-lg">
          {selectedEvent ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-sgvu-navy">{selectedEvent.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <Badge className={cn('border', categoryMeta(selectedEvent.category).badgeClass)}>
                  {categoryMeta(selectedEvent.category).label}
                </Badge>
                <DetailRow
                  label="Date"
                  value={
                    selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.date
                      ? `${formatEventDate(selectedEvent.date)} – ${formatEventDate(selectedEvent.end_date)}`
                      : formatEventDate(selectedEvent.date)
                  }
                />
                <DetailRow
                  label="Start Time"
                  value={selectedEvent.start_time || 'All day'}
                />
                <DetailRow label="End Time" value={selectedEvent.end_time || '—'} />
                <DetailRow label="What is this?" value={selectedEvent.description} />
                {selectedEvent.student_tip ? (
                  <div className="rounded-xl border border-sgvu-gold/40 bg-sgvu-gold/15 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sgvu-navy/70">
                      Tip for you
                    </p>
                    <p className="mt-0.5 text-sgvu-navy">{selectedEvent.student_tip}</p>
                  </div>
                ) : null}
                <DetailRow label="Department" value={selectedEvent.department || '—'} />
                <DetailRow label="Where" value={selectedEvent.venue || '—'} />
                <DetailRow label="Organized by" value={selectedEvent.organizer || '—'} />
                {selectedEvent.attachment_url ? (
                  <a
                    href={selectedEvent.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-sgvu-navy underline"
                  >
                    Open attachment
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <DetailRow label="Attachment" value="Not available" />
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(googleCalendarUrl(selectedEvent), '_blank')}
                  >
                    Add to Google Calendar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-sgvu-navy text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy"
                    onClick={() => {
                      downloadIcsFile([selectedEvent], `${selectedEvent.title.replace(/\s+/g, '-')}.ics`);
                      toast.success('Event exported as .ics');
                    }}
                  >
                    Export .ics
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(null)}>
                    <X className="h-4 w-4" />
                    Close
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </StudentPageShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sgvu-navy">{value}</p>
    </div>
  );
}
