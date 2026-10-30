'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock3, MapPin, UserRound } from 'lucide-react';
import { HodActionButton, HodDayTabs, HodMetricChip, HodPageFrame, HodPageHeader, HodPanel } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type Slot = {
  timetable_id: string; faculty_user_id: string; day_of_week: number; start_time: string; end_time: string;
  room: string | null; course_code: string; course_name: string; faculty_name: string;
  program_name?: string | null; semester?: string | null;
};
type Unscheduled = { allocation_id: string; program_name: string | null; semester: string | null; course_code: string; course_name: string; faculty_name: string; faculty_user_id: string };
const DAYS = [{ id: 1, label: 'Monday' }, { id: 2, label: 'Tuesday' }, { id: 3, label: 'Wednesday' }, { id: 4, label: 'Thursday' }, { id: 5, label: 'Friday' }, { id: 6, label: 'Saturday' }];
function clock(value: string) { const [hour, minute] = String(value).split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`; }
function tone(slot: Slot) {
  if (/practical|lab/i.test(slot.course_name)) return 'border-amber-200 bg-amber-50 text-amber-950';
  if (/tutorial/i.test(slot.course_name)) return 'border-emerald-200 bg-emerald-50 text-emerald-950';
  return 'border-blue-200 bg-blue-50 text-sgvu-navy';
}

export default function HodDepartmentTimetablePage() {
  const api = useAuthedApi();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [unscheduled, setUnscheduled] = useState<Unscheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [day, setDay] = useState<number | 'all'>(1);
  const [facultyId, setFacultyId] = useState('all');
  const [semester, setSemester] = useState('all');

  useEffect(() => { setFacultyId(new URLSearchParams(window.location.search).get('faculty') || 'all'); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.get<{ slots: Slot[]; unscheduled: Unscheduled[] }>('/api/academics/hod/department-timetable')
      .then((data) => { if (active) { setSlots(data.slots || []); setUnscheduled(data.unscheduled || []); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load timetable'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  const faculty = useMemo(() => [...new Map([...slots, ...unscheduled].map((row) => [row.faculty_user_id, row.faculty_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [slots, unscheduled]);
  const semesters = useMemo(() => [...new Set(slots.map((slot) => slot.semester).filter(Boolean))].sort() as string[], [slots]);
  const filtered = useMemo(() => slots.filter((slot) => (facultyId === 'all' || slot.faculty_user_id === facultyId) && (semester === 'all' || slot.semester === semester)), [slots, facultyId, semester]);
  const visibleDays = DAYS.filter((entry) => day === 'all' || day === entry.id);
  const counts = Object.fromEntries(DAYS.map((entry) => [entry.id, filtered.filter((slot) => slot.day_of_week === entry.id).length]));
  const unscheduledVisible = unscheduled.filter((row) => (facultyId === 'all' || row.faculty_user_id === facultyId) && (semester === 'all' || row.semester === semester));

  return <HodPageFrame>
    <HodPageHeader title="Department timetable" workspaceLabel="Department oversight" description="A read-only view of classes taught by your department and classes taken by its students. Your personal schedule is under My Teaching."
      meta={<><HodMetricChip label="Weekly classes" value={filtered.length} emphasis /><HodMetricChip label="Courses" value={new Set(filtered.map((slot) => slot.course_code)).size} /><HodMetricChip label="Faculty" value={faculty.length} /></>}
      actions={<><HodActionButton href="/hod/my-teaching/timetable" variant="outline">My teaching timetable</HodActionButton><HodActionButton href="/hod/academics/course-allocation" variant="primary">Course allocation</HodActionButton></>} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap gap-4">
        <label className="min-w-48 flex-1 text-sm font-semibold text-sgvu-navy">Faculty<select className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 font-normal" value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="all">All department faculty</option>{faculty.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="min-w-36 text-sm font-semibold text-sgvu-navy">Semester<select className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 font-normal" value={semester} onChange={(event) => setSemester(event.target.value)}><option value="all">All semesters</option>{semesters.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="mt-5"><HodDayTabs days={DAYS} active={day} onChange={setDay} counts={counts} /></div>
      {loading ? <p className="py-8 text-sm text-slate-500">Loading department schedule…</p> : <div className="mt-5 grid gap-4 xl:grid-cols-2">{visibleDays.map((entry) => {
        const daySlots = filtered.filter((slot) => slot.day_of_week === entry.id).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.course_code.localeCompare(b.course_code));
        return <section key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4" aria-label={`${entry.label} schedule`}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold text-sgvu-navy">{entry.label}</h2><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{daySlots.length} classes</span></div>
          {daySlots.length ? <div className="space-y-4">{[false, true].map((afternoon) => {
            const period = daySlots.filter((slot) => Number(slot.start_time.slice(0, 2)) >= 12 === afternoon);
            return period.length ? <div key={String(afternoon)}><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{afternoon ? 'Afternoon' : 'Morning'}</h3><div className="space-y-2">{period.map((slot) => <div key={slot.timetable_id} className={`rounded-lg border p-3 ${tone(slot)}`}>
              <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-bold">{slot.course_code} · {slot.course_name}</p><span className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold tabular-nums"><Clock3 className="h-3.5 w-3.5" />{clock(slot.start_time)}–{clock(slot.end_time)}</span></div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{slot.faculty_name}</span><span>{slot.program_name || 'Programme unspecified'} · Semester {slot.semester || '—'}</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{slot.room || 'Room not set'}</span></div>
            </div>)}</div></div> : null;
          })}</div> : <p className="text-sm text-slate-500">No classes on this day.</p>}
        </section>;
      })}</div>}
    </div>
    {!loading && unscheduledVisible.length > 0 && <HodPanel title="Allocated courses without a scheduled class" count={unscheduledVisible.length}><p className="mb-3 text-sm text-slate-600">These courses have a faculty allocation but no published time. They do not appear in the calendar.</p><ul className="divide-y divide-slate-100">{unscheduledVisible.map((row) => <li key={row.allocation_id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="font-semibold text-sgvu-navy">{row.course_code} · {row.course_name}</span><span className="text-slate-600">{row.faculty_name} · {row.program_name || 'Programme unspecified'} · Semester {row.semester || '—'}</span></li>)}</ul><Link href="/hod/academics/course-allocation" className="mt-3 inline-block text-sm font-semibold text-sgvu-navy underline">Open course allocation</Link></HodPanel>}
  </HodPageFrame>;
}
