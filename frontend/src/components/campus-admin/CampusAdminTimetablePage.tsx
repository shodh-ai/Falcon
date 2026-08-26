'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

const DAYS = [
  { id: 1, label: 'Monday', short: 'Mon' },
  { id: 2, label: 'Tuesday', short: 'Tue' },
  { id: 3, label: 'Wednesday', short: 'Wed' },
  { id: 4, label: 'Thursday', short: 'Thu' },
  { id: 5, label: 'Friday', short: 'Fri' },
  { id: 6, label: 'Saturday', short: 'Sat' },
  { id: 7, label: 'Sunday', short: 'Sun' },
] as const;

const DAY_LABEL = Object.fromEntries(DAYS.map((day) => [day.id, day.label])) as Record<number, string>;
const DAY_SHORT = Object.fromEntries(DAYS.map((day) => [day.id, day.short])) as Record<number, string>;

const PAGE_SIZE = 12;

type TimetableSlot = {
  slot_id: string;
  room_code: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_code?: string | null;
  faculty_user_id?: string | null;
  faculty_name?: string | null;
  academic_year?: string | null;
  created_at?: string | null;
};

type TimetableConflict = {
  slot_id: string;
  conflicting_slot_id: string;
  room_code?: string | null;
  day_of_week?: number | null;
  start_time?: string | null;
  end_time?: string | null;
};

type SortKey = 'day_of_week' | 'start_time' | 'room_code' | 'course_code' | 'faculty_name';
type ViewMode = 'list' | 'week';

function formatTime(value?: string | null) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function display(value?: string | number | null) {
  if (value == null || value === '') return '—';
  return String(value);
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

export function CampusAdminTimetablePage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<TimetableSlot[]>([]);
  const [conflicts, setConflicts] = useState<TimetableConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<SortKey>('day_of_week');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TimetableSlot | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [slotForm, setSlotForm] = useState({
    room_code: '',
    day_of_week: '1',
    start_time: '09:00',
    end_time: '10:00',
    course_code: '',
    academic_year: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [slots, conflictRows] = await Promise.all([
        api.get<TimetableSlot[]>('/api/admin-ops/timetable'),
        api.get<TimetableConflict[]>('/api/admin-control/timetable/conflicts').catch(() => []),
      ]);
      setRows(Array.isArray(slots) ? slots : []);
      setConflicts(Array.isArray(conflictRows) ? conflictRows : []);
    } catch (err) {
      setRows([]);
      setConflicts([]);
      setError(parseApiError(err) || 'Unable to load the master timetable.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(
    () =>
      [...new Set(rows.map((row) => row.academic_year).filter((value): value is string => Boolean(value)))].sort(),
    [rows],
  );

  const rooms = useMemo(
    () => [...new Set(rows.map((row) => row.room_code).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (academicYear && row.academic_year !== academicYear) return false;
      if (dayFilter && String(row.day_of_week) !== dayFilter) return false;
      if (roomFilter && row.room_code !== roomFilter) return false;
      if (
        term &&
        !`${row.room_code} ${row.course_code ?? ''} ${row.faculty_name ?? ''} ${DAY_LABEL[row.day_of_week] ?? ''}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });

    const direction = sortDir === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      if (sortKey === 'day_of_week') {
        const dayCompare = (a.day_of_week - b.day_of_week) * direction;
        if (dayCompare !== 0) return dayCompare;
        return String(a.start_time).localeCompare(String(b.start_time)) * direction;
      }
      if (sortKey === 'start_time') {
        return String(a.start_time).localeCompare(String(b.start_time)) * direction;
      }
      const left = String(a[sortKey] ?? '');
      const right = String(b[sortKey] ?? '');
      return left.localeCompare(right, undefined, { sensitivity: 'base' }) * direction;
    });
    return next;
  }, [academicYear, dayFilter, q, roomFilter, rows, sortDir, sortKey]);

  const stats = useMemo(() => {
    const roomSet = new Set(filtered.map((row) => row.room_code));
    const facultySet = new Set(filtered.map((row) => row.faculty_name).filter(Boolean));
    const courseSet = new Set(filtered.map((row) => row.course_code).filter(Boolean));
    const conflictIds = new Set(conflicts.map((row) => row.slot_id));
    const visibleConflicts = filtered.filter((row) => conflictIds.has(row.slot_id)).length;
    return {
      slots: filtered.length,
      rooms: roomSet.size,
      faculty: facultySet.size,
      courses: courseSet.size,
      conflicts: visibleConflicts,
    };
  }, [conflicts, filtered]);

  const weekGrid = useMemo(() => {
    const byDay: Record<number, TimetableSlot[]> = {};
    for (const day of DAYS) byDay[day.id] = [];
    for (const row of filtered) {
      if (byDay[row.day_of_week]) byDay[row.day_of_week].push(row);
    }
    for (const day of DAYS) {
      byDay[day.id].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
    return byDay;
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, academicYear, dayFilter, roomFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  async function addSlot(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    try {
      await api.post('/api/admin-ops/timetable', {
        room_code: slotForm.room_code.trim(),
        day_of_week: Number(slotForm.day_of_week),
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
        course_code: slotForm.course_code.trim(),
        academic_year:
          slotForm.academic_year.trim() ||
          academicYear ||
          String(new Date().getFullYear()),
      });
      toast.success('Timetable slot added.');
      setShowAdd(false);
      setSlotForm({
        room_code: '',
        day_of_week: '1',
        start_time: '09:00',
        end_time: '10:00',
        course_code: '',
        academic_year: academicYear || '',
      });
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'Could not add timetable slot');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Timetable</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Master timetable and room allocation for teaching slots on your campus.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-9" onClick={() => setShowAdd((prev) => !prev)}>
              <Plus className="h-4 w-4" />
              {showAdd ? 'Close form' : 'Add slot'}
            </Button>
            <Button asChild className="h-9" variant="outline">
              <Link href={campusAdminRoutes.academicsClassrooms}>View classrooms</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {showAdd ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-sgvu-navy">Add timetable slot</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addSlot} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Room code
                </label>
                <Input
                  required
                  value={slotForm.room_code}
                  onChange={(e) => setSlotForm((prev) => ({ ...prev, room_code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Day
                </label>
                <Select
                  value={slotForm.day_of_week}
                  onChange={(e) => setSlotForm((prev) => ({ ...prev, day_of_week: e.target.value }))}
                >
                  {DAYS.map((day) => (
                    <option key={day.id} value={String(day.id)}>
                      {day.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Academic year
                </label>
                <Input
                  placeholder={academicYear || String(new Date().getFullYear())}
                  value={slotForm.academic_year}
                  onChange={(e) =>
                    setSlotForm((prev) => ({ ...prev, academic_year: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Start
                </label>
                <Input
                  type="time"
                  required
                  value={slotForm.start_time}
                  onChange={(e) => setSlotForm((prev) => ({ ...prev, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  End
                </label>
                <Input
                  type="time"
                  required
                  value={slotForm.end_time}
                  onChange={(e) => setSlotForm((prev) => ({ ...prev, end_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Course code
                </label>
                <Input
                  required
                  value={slotForm.course_code}
                  onChange={(e) => setSlotForm((prev) => ({ ...prev, course_code: e.target.value }))}
                  placeholder="Required for campus scoping"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Button type="submit" disabled={adding} className="h-9">
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save slot
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {stats.conflicts > 0 ? (
        <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
          <CardContent className="p-4 text-sm text-amber-950">
            {stats.conflicts} slot{stats.conflicts === 1 ? '' : 's'} in the current view overlap on room or faculty.
            Conflicting double-bookings are blocked when new slots are saved.
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
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <StatChip label="Slots" value={loading ? '—' : stats.slots} />
                <StatChip label="Rooms" value={loading ? '—' : stats.rooms} />
                <StatChip label="Courses" value={loading ? '—' : stats.courses} />
                <StatChip label="Faculty" value={loading ? '—' : stats.faculty} />
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search room, course, or faculty..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-36"
                  >
                    <option value="">All years</option>
                    {years.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={dayFilter}
                    onChange={(e) => setDayFilter(e.target.value)}
                    className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-36"
                  >
                    <option value="">All days</option>
                    {DAYS.map((day) => (
                      <option key={day.id} value={String(day.id)}>
                        {day.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={roomFilter}
                    onChange={(e) => setRoomFilter(e.target.value)}
                    className="h-10 w-full rounded-xl border-sgvu-navy/15 sm:w-40"
                  >
                    <option value="">All rooms</option>
                    {rooms.map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                  </Select>
                  <div className="flex rounded-xl border border-gray-200 bg-white p-1">
                    <button
                      type="button"
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${view === 'list' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                      onClick={() => setView('list')}
                    >
                      <List className="h-3.5 w-3.5" />
                      List
                    </button>
                    <button
                      type="button"
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${view === 'week' ? 'bg-sgvu-navy text-white' : 'text-sgvu-navy'}`}
                      onClick={() => setView('week')}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Week
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading timetable…
                </p>
              ) : view === 'week' ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {DAYS.map((day) => (
                    <section
                      key={day.id}
                      className="rounded-xl border border-sgvu-navy/10 bg-slate-50/50 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-sgvu-navy">{day.label}</p>
                        <Badge variant="secondary">{weekGrid[day.id].length}</Badge>
                      </div>
                      {weekGrid[day.id].length === 0 ? (
                        <p className="rounded-lg border border-dashed border-sgvu-navy/15 bg-white px-3 py-6 text-center text-xs text-muted-foreground">
                          No slots scheduled.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {weekGrid[day.id].map((row) => (
                            <button
                              key={row.slot_id}
                              type="button"
                              className="w-full rounded-lg border border-sgvu-navy/10 bg-white p-3 text-left hover:border-sgvu-navy/25"
                              onClick={() => setSelected(row)}
                            >
                              <p className="text-sm font-semibold text-sgvu-navy">
                                {formatTime(row.start_time)}–{formatTime(row.end_time)} · {display(row.room_code)}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {display(row.course_code)} · {display(row.faculty_name)}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <SortHeader label="Room" active={sortKey === 'room_code'} dir={sortDir} onClick={() => toggleSort('room_code')} />
                          <SortHeader label="Day" active={sortKey === 'day_of_week'} dir={sortDir} onClick={() => toggleSort('day_of_week')} />
                          <SortHeader label="Time" active={sortKey === 'start_time'} dir={sortDir} onClick={() => toggleSort('start_time')} />
                          <SortHeader label="Course" active={sortKey === 'course_code'} dir={sortDir} onClick={() => toggleSort('course_code')} />
                          <SortHeader label="Faculty" active={sortKey === 'faculty_name'} dir={sortDir} onClick={() => toggleSort('faculty_name')} />
                          <th className="p-3 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              No timetable slots match these filters.
                            </td>
                          </tr>
                        ) : (
                          pageRows.map((row) => (
                            <tr key={row.slot_id} className="border-b last:border-0 hover:bg-muted/40">
                              <td className="p-3 font-semibold text-sgvu-navy">{display(row.room_code)}</td>
                              <td className="p-3">{DAY_SHORT[row.day_of_week] ?? display(row.day_of_week)}</td>
                              <td className="p-3 tabular-nums">
                                {formatTime(row.start_time)}–{formatTime(row.end_time)}
                              </td>
                              <td className="p-3">{display(row.course_code)}</td>
                              <td className="p-3">{display(row.faculty_name)}</td>
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
          <SlotDetailPanel slot={selected} hasConflict={Boolean(selected && conflicts.some((row) => row.slot_id === selected.slot_id))} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sgvu-navy/10 bg-slate-50 px-2.5 py-1">
      <span>{label}</span>
      <span className="font-semibold text-sgvu-navy">{value}</span>
    </span>
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

function SlotDetailPanel({ slot, hasConflict }: { slot: TimetableSlot | null; hasConflict: boolean }) {
  if (!slot) return null;

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Timetable slot</p>
        <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
          {display(slot.room_code)} · {DAY_LABEL[slot.day_of_week] ?? display(slot.day_of_week)}
        </SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">
          {formatTime(slot.start_time)}–{formatTime(slot.end_time)} · {display(slot.course_code)}
        </SheetDescription>
        {hasConflict ? (
          <Badge className="mt-2 w-fit" variant="warning">
            Possible overlap
          </Badge>
        ) : null}
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        <Section title="Schedule">
          <Field label="Room" value={slot.room_code} />
          <Field label="Day" value={DAY_LABEL[slot.day_of_week] ?? slot.day_of_week} />
          <Field label="Start" value={formatTime(slot.start_time)} />
          <Field label="End" value={formatTime(slot.end_time)} />
          <Field label="Academic year" value={slot.academic_year} />
        </Section>
        <Section title="Teaching">
          <Field label="Course" value={slot.course_code} />
          <Field label="Faculty" value={slot.faculty_name} />
        </Section>
        <Section title="Record">
          <Field label="Slot ID" value={slot.slot_id} />
          <Field label="Created" value={formatDateTime(slot.created_at)} />
        </Section>
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

function Field({ label, value }: { label: string; value?: string | number | null }) {
  const text = display(value);
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">{text}</dd>
    </div>
  );
}
