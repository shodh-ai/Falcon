'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { HodPageFrame, HodPageHeader, HodPanel } from '@/components/hod/HodPagePrimitives';

type DeficitRow = {
  user_id: string;
  name: string;
  email: string;
  average_attendance: number;
  course_count: number;
};

export default function HodStudentDefaultersPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<DeficitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<{ attendance_deficits: DeficitRow[] }>('/api/academics/hod/command-center')
      .then((data) => setRows(data.attendance_deficits ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Attendance Defaulters"
        description="Students in your department below 75% average attendance — from live enrollment records."
      />
      <div className="mb-4">
        <Link
          href="/hod/student-monitor?lowAttendance=true"
          className="text-xs font-bold text-sgvu-navy underline underline-offset-2"
        >
          Open full Student Monitor (low attendance filter)
        </Link>
      </div>
      <HodPanel title="Students below threshold" count={rows.length}>
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No students below 75% right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <li key={row.user_id} className="flex items-center gap-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sgvu-navy text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-sgvu-navy">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-rose-600 tabular-nums">{row.average_attendance}%</p>
                  <p className="text-[10px] text-muted-foreground">{row.course_count} courses</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HodPanel>
    </HodPageFrame>
  );
}
