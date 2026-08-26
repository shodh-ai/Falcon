'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuthedApi } from '@/lib/api';
import { createCampusEventsApi } from '@/lib/api/api.campus-events';
import { toast } from '@/lib/notifications/falcon-toast';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAGE_SIZE = 10;

type CalendarEntry = {
  calendar_id: string;
  date: string;
  title: string;
  description?: string | null;
  is_blocked_for_events?: boolean;
  academic_year?: string | null;
  created_at?: string | null;
};

type SortKey = 'date' | 'title' | 'academic_year';
type ViewMode = 'calendar' | 'list';

function dateIso(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function parseLocalDate(value?: string | null) {
  const iso = dateIso(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value?: string | null) {
  const date = parseLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function weekday(value?: string | null) {
  const date = parseLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { weekday: 'long' });
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Academic year label as YYYY-YY (e.g. 2020-21). Year runs Jul–Jun. */
function formatAcademicYearLabel(startYear: number) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function currentAcademicStartYear(now = new Date()) {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function parseAcademicStartYear(label: string): number | null {
  const match = /^(\d{4})(?:\s*[-–/]\s*\d{2,4})?$/.exec(label.trim());
  if (!match) return null;
  return Number(match[1]);
}

function buildAcademicYearOptions(fromData: string[], now = new Date()) {
  const oldest = 2015;
  const newest = currentAcademicStartYear(now) + 2;
  const generated: string[] = [];
  for (let year = newest; year >= oldest; year -= 1) {
    generated.push(formatAcademicYearLabel(year));
  }
  const merged = new Set<string>([...generated, ...fromData.filter(Boolean)]);
  return [...merged].sort((a, b) => {
    const aStart = parseAcademicStartYear(a) ?? 0;
    const bStart = parseAcademicStartYear(b) ?? 0;
    return bStart - aStart || b.localeCompare(a);
  });
}

function display(value?: string | number | boolean | null) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ iso: string; inMonth: boolean; day: number }> = [];

  for (let i = 0; i < startOffset; i += 1) {
    const date = new Date(year, month, -startOffset + i + 1);
    cells.push({
      iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      inMonth: false,
      day: date.getDate(),
    });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      inMonth: true,
      day,
    });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const date = parseLocalDate(last.iso);
    if (!date) break;
    date.setDate(date.getDate() + 1);
    cells.push({
      iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      inMonth: false,
      day: date.getDate(),
    });
  }
  return cells;
}

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

export function CampusAdminAcademicCalendarPage() {
  const api = useAuthedApi();
  const eventsApi = useMemo(() => createCampusEventsApi(api), [api]);
  const today = useMemo(() => todayIso(), []);
  const now = useMemo(() => new Date(), []);

  const [rows, setRows] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState('');
  const [view, setView] = useState<ViewMode>('calendar');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [monthCursor, setMonthCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const didFocusMonth = useRef(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryForm, setEntryForm] = useState({
    date: todayIso(),
    title: '',
    description: '',
    academic_year: '',
    is_blocked_for_events: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await eventsApi.masterCalendar();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(parseApiError(err) || 'Unable to load the academic calendar.');
    } finally {
      setLoading(false);
    }
  }, [eventsApi]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!rows.length || didFocusMonth.current) return;
    const upcoming = rows
      .map((row) => dateIso(row.date))
      .filter((iso) => iso >= today)
      .sort()[0];
    const focus = upcoming || dateIso(rows[0]?.date);
    const date = parseLocalDate(focus);
    if (!date) return;
    didFocusMonth.current = true;
    setMonthCursor({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedDay(focus);
  }, [rows, today]);

  const years = useMemo(() => {
    const fromData = rows
      .map((row) => row.academic_year)
      .filter((value): value is string => Boolean(value));
    return buildAcademicYearOptions(fromData, now);
  }, [now, rows]);

  const yearsWithEntries = useMemo(() => {
    return new Set(
      rows
        .map((row) => row.academic_year)
        .filter((value): value is string => Boolean(value)),
    );
  }, [rows]);

  const chooseAcademicYear = (year: string) => {
    setAcademicYear(year);
    if (!year) return;
    const startYear = parseAcademicStartYear(year);
    if (startYear == null) return;
    // Jump calendar to the start of that academic year (July).
    setMonthCursor({ year: startYear, month: 6 });
    setSelectedDay(`${startYear}-07-01`);
  };

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (academicYear && row.academic_year !== academicYear) return false;
      return true;
    });
    const direction = sortDir === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      if (sortKey === 'date') return dateIso(a.date).localeCompare(dateIso(b.date)) * direction;
      if (sortKey === 'academic_year') {
        return (a.academic_year ?? '').localeCompare(b.academic_year ?? '', undefined, { sensitivity: 'base' }) * direction;
      }
      return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' }) * direction;
    });
    return next;
  }, [academicYear, rows, sortDir, sortKey]);

  const monthPrefix = `${monthCursor.year}-${String(monthCursor.month + 1).padStart(2, '0')}`;
  const monthEntries = useMemo(
    () => filtered.filter((row) => dateIso(row.date).startsWith(monthPrefix)),
    [filtered, monthPrefix],
  );
  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const row of monthEntries) {
      const iso = dateIso(row.date);
      const list = map.get(iso) ?? [];
      list.push(row);
      map.set(iso, list);
    }
    return map;
  }, [monthEntries]);
  const selectedDayEntries = selectedDay ? entriesByDay.get(selectedDay) ?? [] : [];
  const grid = useMemo(
    () => buildMonthGrid(monthCursor.year, monthCursor.month),
    [monthCursor.month, monthCursor.year],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [academicYear, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const shiftMonth = (delta: number) => {
    const date = new Date(monthCursor.year, monthCursor.month + delta, 1);
    setMonthCursor({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedDay(null);
  };

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await eventsApi.upsertCalendar({
        date: entryForm.date,
        title: entryForm.title.trim(),
        description: entryForm.description.trim() || null,
        academic_year:
          entryForm.academic_year.trim() ||
          academicYear ||
          formatAcademicYearLabel(currentAcademicStartYear()),
        is_blocked_for_events: entryForm.is_blocked_for_events,
      });
      toast.success('Calendar entry saved.');
      setShowAdd(false);
      setEntryForm({
        date: todayIso(),
        title: '',
        description: '',
        academic_year: academicYear || '',
        is_blocked_for_events: true,
      });
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'Could not save calendar entry');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entry: CalendarEntry) {
    if (!window.confirm(`Delete “${entry.title}” on ${formatDate(entry.date)}?`)) return;
    setSaving(true);
    try {
      await eventsApi.deleteCalendar(entry.calendar_id);
      toast.success('Calendar entry deleted.');
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'Could not delete calendar entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Academic Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              University academic calendar for your campus. Add blocked dates and key academic milestones.
            </p>
          </div>
          <Button type="button" className="h-9" onClick={() => setShowAdd((prev) => !prev)}>
            <Plus className="h-4 w-4" />
            {showAdd ? 'Close form' : 'Add date'}
          </Button>
        </CardContent>
      </Card>

      {showAdd ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-sgvu-navy">Add calendar entry</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveEntry} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Date
                </label>
                <Input
                  type="date"
                  required
                  value={entryForm.date}
                  onChange={(e) => setEntryForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Academic year
                </label>
                <Input
                  placeholder={academicYear || formatAcademicYearLabel(currentAcademicStartYear())}
                  value={entryForm.academic_year}
                  onChange={(e) =>
                    setEntryForm((prev) => ({ ...prev, academic_year: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Title
                </label>
                <Input
                  required
                  value={entryForm.title}
                  onChange={(e) => setEntryForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Description
                </label>
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-border/60 px-3 py-2 text-sm"
                  value={entryForm.description}
                  onChange={(e) =>
                    setEntryForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-sgvu-navy sm:col-span-2">
                <input
                  type="checkbox"
                  checked={entryForm.is_blocked_for_events}
                  onChange={(e) =>
                    setEntryForm((prev) => ({
                      ...prev,
                      is_blocked_for_events: e.target.checked,
                    }))
                  }
                />
                Block campus events on this date
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving} className="h-9">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save entry
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Academic year
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-[11rem] justify-between rounded-xl border-sgvu-navy/20 bg-white px-3.5 text-sgvu-navy hover:bg-sgvu-navy/5"
                      >
                        <span className="font-semibold">
                          {academicYear || 'All years'}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-72 w-[13rem] overflow-y-auto rounded-xl border-sgvu-navy/10 p-1 shadow-lg"
                    >
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Choose year
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer justify-between rounded-lg"
                        onSelect={() => chooseAcademicYear('')}
                      >
                        <span className="font-medium">All years</span>
                        {academicYear === '' ? (
                          <Check className="h-4 w-4 text-sgvu-navy" />
                        ) : null}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {years.map((item) => {
                        const active = academicYear === item;
                        const hasEntries = yearsWithEntries.has(item);
                        return (
                          <DropdownMenuItem
                            key={item}
                            className="cursor-pointer justify-between rounded-lg"
                            onSelect={() => chooseAcademicYear(item)}
                          >
                            <span className={hasEntries ? 'font-medium' : 'text-muted-foreground'}>
                              {item}
                              {!hasEntries ? (
                                <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide">
                                  empty
                                </span>
                              ) : null}
                            </span>
                            {active ? <Check className="h-4 w-4 text-sgvu-navy" /> : null}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex w-fit shrink-0 rounded-xl border border-gray-200 bg-white p-1">
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${view === 'calendar' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setView('calendar')}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Calendar
                  </button>
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${view === 'list' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                    onClick={() => setView('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                    List
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading academic calendar…
                </p>
              ) : view === 'calendar' ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
                  <div className="rounded-xl border border-sgvu-navy/10">
                    <div className="flex items-center justify-between border-b border-sgvu-navy/10 px-4 py-3">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <p className="text-sm font-semibold text-sgvu-navy">
                        {new Date(monthCursor.year, monthCursor.month, 1).toLocaleDateString('en-IN', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shiftMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-7 border-b border-sgvu-navy/10 bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {WEEKDAYS.map((day) => (
                        <div key={day} className="px-1 py-2">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {grid.map((cell) => {
                        const dayRows = entriesByDay.get(cell.iso) ?? [];
                        const isSelected = selectedDay === cell.iso;
                        const isToday = cell.iso === today;
                        return (
                          <button
                            key={cell.iso}
                            type="button"
                            onClick={() => setSelectedDay(cell.iso)}
                            className={`min-h-[4.5rem] border-b border-r border-sgvu-navy/5 p-2 text-left last:border-r-0 ${
                              cell.inMonth ? 'bg-white' : 'bg-slate-50 text-muted-foreground'
                            } ${isSelected ? 'bg-sgvu-navy/5 ring-1 ring-inset ring-sgvu-navy/30' : ''}`}
                          >
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                                isToday ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'
                              }`}
                            >
                              {cell.day}
                            </span>
                            {dayRows.length ? (
                              <span className="mt-2 block truncate text-[11px] font-medium text-sgvu-navy">
                                {dayRows[0]?.title}
                                {dayRows.length > 1 ? ` +${dayRows.length - 1}` : ''}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-sgvu-navy/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {selectedDay ? formatDate(selectedDay) : 'Select a date'}
                    </p>
                    <div className="mt-3 space-y-2">
                      {selectedDayEntries.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-sgvu-navy/15 px-3 py-8 text-center text-sm text-muted-foreground">
                          No calendar entries on this date.
                        </p>
                      ) : (
                        selectedDayEntries.map((row) => (
                          <button
                            key={row.calendar_id}
                            type="button"
                            className="w-full rounded-lg border border-sgvu-navy/10 bg-white p-3 text-left hover:border-sgvu-navy/25"
                            onClick={() => setSelected(row)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-sgvu-navy">{row.title}</p>
                              <Badge variant={row.is_blocked_for_events === false ? 'secondary' : 'warning'}>
                                {row.is_blocked_for_events === false ? 'Open' : 'Blocked'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{display(row.academic_year)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <SortHeader label="Date" active={sortKey === 'date'} dir={sortDir} onClick={() => toggleSort('date')} />
                          <SortHeader label="Title" active={sortKey === 'title'} dir={sortDir} onClick={() => toggleSort('title')} />
                          <SortHeader
                            label="Academic year"
                            active={sortKey === 'academic_year'}
                            dir={sortDir}
                            onClick={() => toggleSort('academic_year')}
                          />
                          <th className="p-3 font-medium">Status</th>
                          <th className="p-3 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-muted-foreground">
                              No calendar dates match these filters.
                            </td>
                          </tr>
                        ) : (
                          pageRows.map((row) => (
                            <tr key={row.calendar_id} className="border-b last:border-0 hover:bg-muted/40">
                              <td className="p-3">
                                {formatDate(row.date)}
                                <br />
                                <span className="text-xs text-muted-foreground">{weekday(row.date)}</span>
                              </td>
                              <td className="p-3 font-semibold text-sgvu-navy">{display(row.title)}</td>
                              <td className="p-3">{display(row.academic_year)}</td>
                              <td className="p-3">
                                <Badge variant={row.is_blocked_for_events === false ? 'secondary' : 'warning'}>
                                  {row.is_blocked_for_events === false ? 'Open' : 'Blocked'}
                                </Badge>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  className="text-sm font-semibold text-sgvu-navy hover:underline"
                                  onClick={() => setSelected(row)}
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
                      {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        className="h-8"
                        size="sm"
                        variant="outline"
                        disabled={safePage <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        className="h-8"
                        size="sm"
                        variant="outline"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          <CalendarDetailPanel
            entry={selected}
            deleting={saving}
            onDelete={(entry) => void deleteEntry(entry)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <th className="p-3 font-medium">
      <button type="button" className="inline-flex items-center gap-1 hover:text-sgvu-navy" onClick={onClick}>
        {label}
        {active ? dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

function CalendarDetailPanel({
  entry,
  deleting,
  onDelete,
}: {
  entry: CalendarEntry | null;
  deleting?: boolean;
  onDelete?: (entry: CalendarEntry) => void;
}) {
  if (!entry) return null;
  const iso = dateIso(entry.date);
  const nextDay = parseLocalDate(entry.date);
  if (nextDay) nextDay.setDate(nextDay.getDate() + 1);
  const googleDates = nextDay
    ? `${iso.replace(/-/g, '')}/${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`
    : '';
  const googleUrl = googleDates
    ? `https://calendar.google.com/calendar/render?${new URLSearchParams({
        action: 'TEMPLATE',
        text: entry.title,
        details: entry.description ?? '',
        dates: googleDates,
      }).toString()}`
    : '';

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Calendar date</p>
        <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">{entry.title}</SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">
          {formatDate(entry.date)} · {weekday(entry.date)}
        </SheetDescription>
        <Badge className="mt-2 w-fit" variant={entry.is_blocked_for_events === false ? 'secondary' : 'warning'}>
          {entry.is_blocked_for_events === false ? 'Open for events' : 'Blocked for events'}
        </Badge>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        <Section title="Details">
          <Field label="Title" value={entry.title} />
          <Field label="Date" value={formatDate(entry.date)} />
          <Field label="Day" value={weekday(entry.date)} />
          <Field label="Academic year" value={entry.academic_year} />
          <Field
            label="Blocked for events"
            value={entry.is_blocked_for_events === false ? 'No' : 'Yes'}
          />
          <Field label="Added" value={formatDateTime(entry.created_at)} />
        </Section>
        <Section title="Description">
          <div className="sm:col-span-2 rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm font-medium text-sgvu-navy">
              {display(entry.description)}
            </dd>
          </div>
        </Section>
        <div className="flex flex-wrap gap-3">
          {googleUrl ? (
            <a
              href={googleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-sm font-semibold text-sgvu-navy hover:underline"
            >
              Add to Google Calendar
            </a>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 text-destructive"
              disabled={deleting}
              onClick={() => onDelete(entry)}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete entry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">{display(value)}</dd>
    </div>
  );
}
