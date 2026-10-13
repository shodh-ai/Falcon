'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodActionButton,
  HodDataTable,
  HodDayTabs,
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type Row = {
  timetable_id: string;
  faculty_user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  faculty_name: string;
  program_name?: string | null;
  semester?: string | null;
};

type UnscheduledRow = {
  allocation_id: string;
  faculty_user_id: string;
  program_name: string | null;
  semester: string | null;
  course_code: string;
  course_name: string;
  faculty_name: string;
};

const DAYS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

const DOW: Record<number, string> = Object.fromEntries(DAYS.map((d) => [d.id, d.label]));

function formatTime(t: string) {
  return `${String(t).slice(0, 5)}`;
}

export default function HodDepartmentTimetablePage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [unscheduled, setUnscheduled] = useState<UnscheduledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all');
  const [facultyFilter, setFacultyFilter] = useState('all');

  useEffect(() => {
    setFacultyFilter(new URLSearchParams(window.location.search).get('faculty') || 'all');
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<{ slots: Row[]; unscheduled: UnscheduledRow[] }>(
          '/api/academics/hod/department-timetable',
        );
        setRows(data.slots ?? []);
        setUnscheduled(data.unscheduled ?? []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load timetable');
        setRows([]);
        setUnscheduled([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const facultyOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of [...rows, ...unscheduled]) options.set(row.faculty_user_id, row.faculty_name);
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, unscheduled]);

  const facultyRows = useMemo(
    () => facultyFilter === 'all' ? rows : rows.filter((r) => r.faculty_user_id === facultyFilter),
    [rows, facultyFilter],
  );

  const facultyUnscheduled = useMemo(
    () => facultyFilter === 'all' ? unscheduled : unscheduled.filter((r) => r.faculty_user_id === facultyFilter),
    [unscheduled, facultyFilter],
  );

  const dayCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const row of facultyRows) c[row.day_of_week] = (c[row.day_of_week] ?? 0) + 1;
    return c;
  }, [facultyRows]);

  const filtered = useMemo(
    () => (dayFilter === 'all' ? facultyRows : facultyRows.filter((r) => r.day_of_week === dayFilter)),
    [facultyRows, dayFilter],
  );

  const stats = useMemo(() => {
    const courses = new Set(facultyRows.map((r) => r.course_code));
    return { slots: facultyRows.length, courses: courses.size, faculty: facultyOptions.length };
  }, [facultyRows, facultyOptions]);

  const weekGrid = useMemo(() => {
    const byDay: Record<number, Row[]> = {};
    for (const d of DAYS) byDay[d.id] = [];
    for (const row of facultyRows) {
      if (byDay[row.day_of_week]) byDay[row.day_of_week].push(row);
    }
    for (const d of DAYS) {
      byDay[d.id].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
    return byDay;
  }, [facultyRows]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Department Timetable"
        description="View each faculty member's weekly teaching calendar or the full department timetable."
        meta={
          <>
            <HodMetricChip label="Slots" value={stats.slots} emphasis />
            <HodMetricChip label="Courses" value={stats.courses} />
            <HodMetricChip label="Faculty" value={stats.faculty} />
          </>
        }
        actions={
          <>
            <HodActionButton href="/hod/academics/course-allocation" variant="primary">
              Course Allocation
            </HodActionButton>
            <HodActionButton href="/hod/dashboard" variant="outline">
              Command Center
            </HodActionButton>
          </>
        }
      />

      <label className="mb-5 block max-w-sm text-sm font-medium text-sgvu-navy">
        Faculty calendar
        <select className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
          value={facultyFilter} onChange={(event) => { setFacultyFilter(event.target.value); setDayFilter('all'); }}>
          <option value="all">All department faculty</option>
          {facultyOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>

      {!loading && facultyRows.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <HodDayTabs days={DAYS} active={dayFilter} onChange={setDayFilter} counts={dayCounts} />
            <HodDataTable
              loading={loading}
              rows={filtered}
              rowKey={(r) => r.timetable_id}
              empty="No slots for this day."
              columns={[
                {
                  key: 'day',
                  label: 'Day',
                  className: 'w-14',
                  render: (r) => <span className="font-semibold">{DOW[r.day_of_week]}</span>,
                },
                {
                  key: 'time',
                  label: 'Time',
                  className: 'whitespace-nowrap w-24',
                  render: (r) => (
                    <span className="tabular-nums">
                      {formatTime(r.start_time)}–{formatTime(r.end_time)}
                    </span>
                  ),
                },
                {
                  key: 'course',
                  label: 'Course',
                  render: (r) => (
                    <div>
                      <span className="font-semibold">{r.course_code}</span>
                      <span className="text-muted-foreground"> · {r.course_name}</span>
                    </div>
                  ),
                },
                {
                  key: 'faculty',
                  label: 'Faculty',
                  render: (r) => r.faculty_name,
                },
                {
                  key: 'semester',
                  label: 'Programme / sem',
                  className: 'w-36',
                  render: (r) => `${r.program_name ?? '—'} · ${r.semester ?? '—'}`,
                },
                {
                  key: 'room',
                  label: 'Room',
                  className: 'w-28',
                  render: (r) => r.room ?? '—',
                },
              ]}
            />
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-4 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-slate-50/60 px-4 py-3">
                <p className="text-sm font-bold text-sgvu-navy">Week at a glance</p>
              </div>
              <div className="max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto p-4">
                {DAYS.map((d) => (
                  <div key={d.id} className="rounded-lg border border-gray-100 bg-slate-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-sgvu-navy">{d.label}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {weekGrid[d.id].length} slot{weekGrid[d.id].length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {weekGrid[d.id].length === 0 ? (
                      <p className="text-sm text-muted-foreground">No classes</p>
                    ) : (
                      <ul className="space-y-2">
                        {weekGrid[d.id].map((slot) => (
                          <li
                            key={slot.timetable_id}
                            className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm"
                          >
                            <p className="font-semibold text-sgvu-navy">
                              {formatTime(slot.start_time)} · {slot.course_code}
                            </p>
                            <p className="truncate text-muted-foreground">{slot.faculty_name}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <HodDataTable
          loading={loading}
          rows={[]}
          rowKey={() => ''}
          empty={facultyFilter === 'all' ? 'No timetable slots configured for your department.' : 'No scheduled classes for this faculty member.'}
          columns={[]}
        />
      )}

      {!loading && facultyRows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Need to reassign a slot?{' '}
          <Link href="/hod/academics/course-allocation" className="font-medium text-sgvu-navy underline">
            Open Course Allocation
          </Link>
        </p>
      ) : null}

      {!loading && facultyUnscheduled.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-amber-950">Assigned classes without timetable slots</h2>
              <p className="text-xs text-amber-800">
                These official allocations are included in workload but need a day, time and room before they appear in the weekly grid.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
              {facultyUnscheduled.length} pending
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-900">
                <tr>
                  <th className="px-3 py-2">Programme / sem</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Faculty</th>
                </tr>
              </thead>
              <tbody>
                {facultyUnscheduled.map((row) => (
                  <tr key={row.allocation_id} className="border-t border-amber-100">
                    <td className="px-3 py-2">{row.program_name ?? '—'} · {row.semester ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold">{row.course_code} <span className="font-normal text-muted-foreground">· {row.course_name}</span></td>
                    <td className="px-3 py-2">{row.faculty_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </HodPageFrame>
  );
}
