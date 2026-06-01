'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export default function AdminOpsTimetablePage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void api.get<Record<string, unknown>[]>('/api/admin-ops/timetable?academic_year=2026-27').then(setRows).catch(() => setRows([]));
  }, [api]);
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Master Timetable & Room Allocation</h1>
      <p className="text-sm text-muted-foreground">Conflicting double-bookings are blocked at save time.</p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="p-2">Room</th>
            <th className="p-2">Day</th>
            <th className="p-2">Time</th>
            <th className="p-2">Course</th>
            <th className="p-2">Faculty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.slot_id)} className="border-b">
              <td className="p-2">{String(r.room_code)}</td>
              <td className="p-2">{String(r.day_of_week)}</td>
              <td className="p-2">
                {String(r.start_time)}–{String(r.end_time)}
              </td>
              <td className="p-2">{String(r.course_code ?? '—')}</td>
              <td className="p-2">{String(r.faculty_name ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
