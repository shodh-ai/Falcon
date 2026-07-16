'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  course_code: string;
  course_name: string;
  faculty_name: string;
  dept_id?: number;
  dept_name?: string | null;
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

export default function DeanSchoolTimetablePage() {
  const api = useAuthedApi();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<string>(
    searchParams.get('dept') ?? 'all',
  );
  const [facultyFilter, setFacultyFilter] = useState<string>('all');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/dean/timetable');
        setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load timetable');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const dayCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const row of rows) c[row.day_of_week] = (c[row.day_of_week] ?? 0) + 1;
    return c;
  }, [rows]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.dept_id != null && row.dept_name) map.set(String(row.dept_id), row.dept_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const facultyOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.faculty_name))).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dayFilter !== 'all' && r.day_of_week !== dayFilter) return false;
      if (deptFilter !== 'all' && String(r.dept_id ?? '') !== deptFilter) return false;
      if (facultyFilter !== 'all' && r.faculty_name !== facultyFilter) return false;
      return true;
    });
  }, [rows, dayFilter, deptFilter, facultyFilter]);

  const stats = useMemo(() => {
    const courses = new Set(rows.map((r) => r.course_code));
    const faculty = new Set(rows.map((r) => r.faculty_name));
    return { slots: rows.length, courses: courses.size, faculty: faculty.size };
  }, [rows]);

  const weekGrid = useMemo(() => {
    const byDay: Record<number, Row[]> = {};
    for (const d of DAYS) byDay[d.id] = [];
    for (const row of rows) {
      if (byDay[row.day_of_week]) byDay[row.day_of_week].push(row);
    }
    for (const d of DAYS) {
      byDay[d.id].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
    return byDay;
  }, [rows]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="School Timetable"
        description="Master view — all classes scheduled across your school's departments."
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <HodMetricChip label="Slots" value={stats.slots} emphasis />
            <HodMetricChip label="Courses" value={stats.courses} />
            <HodMetricChip label="Faculty" value={stats.faculty} />
          </>
        }
        actions={
          <>
            <HodActionButton href="/dean/academics/course-allocation" variant="primary">
              Course Allocation Review
            </HodActionButton>
            <HodActionButton href="/dean/dashboard" variant="outline">
              Command Center
            </HodActionButton>
          </>
        }
      />

      {!loading && rows.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                value={facultyFilter}
                onChange={(e) => setFacultyFilter(e.target.value)}
              >
                <option value="all">All faculty</option>
                {facultyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <HodDayTabs days={DAYS} active={dayFilter} onChange={setDayFilter} counts={dayCounts} />
            <HodDataTable
              loading={loading}
              rows={filtered}
              rowKey={(r) => r.timetable_id}
              empty="No slots for this filter."
              columns={[
                {
                  key: 'day',
                  label: 'Day',
                  className: 'w-14',
                  render: (r) => <span className="font-semibold">{DOW[r.day_of_week]}</span>,
                },
                {
                  key: 'dept',
                  label: 'Department',
                  render: (r) => r.dept_name ?? '—',
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
          empty="No timetable slots configured for your school."
          columns={[]}
        />
      )}

      {!loading && rows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Need to review allocations?{' '}
          <Link href="/dean/academics/course-allocation" className="font-medium text-sgvu-navy underline">
            Open Course Allocation Review
          </Link>
        </p>
      ) : null}
    </HodPageFrame>
  );
}
