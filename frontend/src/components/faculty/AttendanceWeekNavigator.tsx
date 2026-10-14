'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import { cn } from '@/lib/utils';

type SessionState = { has_saved_attendance?: boolean; attendance_locked?: boolean; awaiting_confirmation?: boolean };
type Day = { date: string; sessions: SessionState[] | null; failed?: boolean };

export function shiftAttendanceDate(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function attendanceWeekStart(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftAttendanceDate(date, -((weekday + 6) % 7));
}

export function attendanceDayStatus(sessions: SessionState[] | null) {
  if (!sessions) return { label: 'Loading…', detail: '', tone: 'neutral' };
  if (!sessions.length) return { label: 'No class', detail: '', tone: 'neutral' };
  const held = sessions.filter(session => session.awaiting_confirmation).length;
  const confirmed = sessions.filter(session => !session.awaiting_confirmation);
  if (!confirmed.length) return { label: 'Awaiting confirmation', detail: `${held} held session${held === 1 ? '' : 's'}`, tone: 'pending' };
  if (sessions.some(session => typeof session.has_saved_attendance !== 'boolean')) {
    return { label: 'Status unavailable', detail: '', tone: 'neutral' };
  }
  const recorded = confirmed.filter(session => session.has_saved_attendance).length;
  const missing = confirmed.filter(session => !session.has_saved_attendance);
  const locked = missing.filter(session => session.attendance_locked).length;
  return {
    label: `${recorded}/${confirmed.length} recorded`,
    detail: (!missing.length ? 'Complete' : locked === missing.length ? `${locked} not recorded · locked` : `${missing.length} pending`) + (held ? ` · ${held} awaiting confirmation` : ''),
    tone: !missing.length && !held ? 'complete' : 'pending',
  };
}

export function AttendanceWeekNavigator({ selectedDate, today, deptId, scopeLoading, revision, onSelect }: {
  selectedDate: string; today: string; deptId: number | null; scopeLoading: boolean;
  revision: number; onSelect: (date: string) => void;
}) {
  const api = useAuthedApi();
  const start = attendanceWeekStart(selectedDate);
  const [result, setResult] = useState<{ start: string; deptId: number | null; revision: number; days: Day[] } | null>(null);
  useEffect(() => {
    if (scopeLoading) return;
    let cancelled = false;
    api.get<Day[]>(withTeachingDeptId(`/api/academics/faculty/attendance/week?start=${start}`, deptId))
      .then(days => {
        if (!Array.isArray(days) || days.length !== 7 || days.some((day, index) => day.date !== shiftAttendanceDate(start, index) || !Array.isArray(day.sessions))) {
          throw new Error('Invalid attendance status response');
        }
        if (!cancelled) setResult({ start, deptId, revision, days });
      }).catch(() => {
        if (!cancelled) setResult({ start, deptId, revision, days: Array.from({ length: 7 }, (_, index) => ({ date: shiftAttendanceDate(start, index), sessions: null, failed: true })) });
      });
    return () => { cancelled = true; };
  }, [api, start, today, deptId, scopeLoading, revision]);

  const resolved = !scopeLoading && result?.start === start && result.deptId === deptId && result.revision === revision;
  const days = resolved ? result.days : Array.from({ length: 7 }, (_, index) => ({ date: shiftAttendanceDate(start, index), sessions: null } as Day));
  const knownSessions = days.flatMap(day => day.sessions || []).filter(session => !session.awaiting_confirmation);
  const recorded = knownSessions.filter(session => session.has_saved_attendance).length;
  return <section aria-label="Attendance week status" className="space-y-3 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-semibold text-sgvu-navy">Attendance this week{resolved && days.every(day => !day.failed) ? ` · ${recorded}/${knownSessions.length} sessions recorded` : ''}</h2>
        <p className="text-xs text-muted-foreground">{start} – {shiftAttendanceDate(start, 6)} · Saved records matched to your published timetable.</p></div>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onSelect(shiftAttendanceDate(selectedDate, -7))}>Previous week</button>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onSelect(today)}>Today</button>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40" disabled={shiftAttendanceDate(start, 7) > today}
          onClick={() => { const next = shiftAttendanceDate(selectedDate, 7); onSelect(next > today ? today : next); }}>Next week</button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {days.map(day => {
        const future = day.date > today;
        const status = attendanceDayStatus(day.sessions);
        const label = future ? 'Upcoming' : day.failed ? 'Could not load' : status.label;
        return <button type="button" key={day.date} disabled={future || !resolved} aria-pressed={day.date === selectedDate}
          aria-label={`${day.date}: ${label}${status.detail ? `, ${status.detail}` : ''}`}
          onClick={() => onSelect(day.date)} className={cn('rounded-xl border p-3 text-left text-sm disabled:opacity-50',
            status.tone === 'complete' ? 'border-emerald-200 bg-emerald-50' : status.tone === 'pending' ? 'border-amber-200 bg-amber-50' : 'bg-background',
            day.date === selectedDate && 'ring-2 ring-sgvu-navy')}>
          <span className="block font-semibold">{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
          <span className="mt-2 block font-medium">{label}</span>
          {!future && <span className="mt-1 block text-xs">{status.detail}</span>}
        </button>;
      })}
    </div>
    <p className="text-xs text-muted-foreground">Green: all sessions recorded. Amber: attendance outstanding. Click a day to review each class. A missing record never means the students were absent.</p>
  </section>;
}
