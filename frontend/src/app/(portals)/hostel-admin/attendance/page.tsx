'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VirtualizedDataTable } from '@/components/ui/VirtualizedDataTable';
import { useAuthedApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/fetch-all-pages';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from '@/lib/notifications/falcon-toast';

type StudentRow = { student_user_id: string; name: string };
type RollRow = {
  student_name: string;
  status: string;
  marked_at: string;
  marked_by_name: string;
};

export default function HostelAttendancePage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [records, setRecords] = useState<RollRow[]>([]);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!hostelId) return;
    void fetchAllPages<StudentRow>((offset, limit) => {
      const q = new URLSearchParams({
        hostelId,
        status: 'ACTIVE',
        limit: String(limit),
        offset: String(offset),
      });
      return api.get<PaginatedResponse<StudentRow>>(`/api/hostel-admin/students?${q}`);
    }).then(setStudents);
    void api
      .get<RollRow[]>(`/api/hostel-admin/roll-call?hostelId=${hostelId}&date=${date}`)
      .then(setRecords);
  }, [api, hostelId, date]);

  async function markAllPresent() {
    if (!hostelId || !students.length) return;
    setMarking(true);
    try {
      await api.post('/api/hostel-admin/roll-call', {
        hostel_id: hostelId,
        records: students.map((s) => ({ student_user_id: s.student_user_id, status: 'PRESENT' })),
      });
      toast.success('Roll call marked for today');
      const updated = await api.get<RollRow[]>(
        `/api/hostel-admin/roll-call?hostelId=${hostelId}&date=${date}`,
      );
      setRecords(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sgvu-navy">Attendance (Hostel Roll Call)</h1>
          <p className="text-sm text-muted-foreground">Nightly curfew roll call — not academic attendance</p>
        </div>
        <Button className="bg-sgvu-navy" disabled={marking || !hostelId} onClick={() => void markAllPresent()}>
          Mark Today&apos;s Attendance
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <HostelScopeBar value={hostelId} onChange={setHostelId} allowAll={false} />
        <input
          type="date"
          className="rounded-lg border px-3 py-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <VirtualizedDataTable
        columns={[
          { key: 'student', header: 'Student', render: (r) => r.student_name },
          { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          {
            key: 'time',
            header: 'Exact Time',
            render: (r) => new Date(r.marked_at).toLocaleTimeString(),
          },
          { key: 'by', header: 'Marked By', render: (r) => r.marked_by_name },
        ]}
        rows={records}
        rowKey={(r, i) => `${r.student_name}-${i}`}
        emptyMessage="No roll call records for this date."
      />
    </div>
  );
}
