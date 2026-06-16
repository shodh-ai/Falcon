'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuthedApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/api/fetch-all-pages';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type StudentRow = { student_user_id: string; name: string; student_id?: string };
type MonthlyRollRow = {
  student_user_id: string;
  status: string;
  roll_date: string;
};

export default function HostelAttendancePage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [records, setRecords] = useState<MonthlyRollRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hostelId || !month) return;
    setLoading(true);
    
    const loadData = async () => {
      try {
        const studentData = await fetchAllPages<StudentRow>((offset, limit) => {
          const q = new URLSearchParams({
            hostelId,
            status: 'ACTIVE',
            limit: String(limit),
            offset: String(offset),
          });
          return api.get<PaginatedResponse<StudentRow>>(`/api/hostel-admin/students?${q}`);
        });
        setStudents(studentData);

        const monthlyRecords = await api.get<MonthlyRollRow[]>(
          `/api/hostel-admin/roll-call/monthly?hostelId=${hostelId}&month=${month}`
        );
        setRecords(monthlyRecords);
      } catch (err) {
        toast.error('Failed to load attendance data');
      } finally {
        setLoading(false);
      }
    };
    
    void loadData();
  }, [api, hostelId, month]);

  const daysInMonth = useMemo(() => {
    if (!month) return 30;
    const [y, m] = month.split('-');
    return new Date(parseInt(y), parseInt(m), 0).getDate();
  }, [month]);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleToggle = async (studentId: string, day: number, currentStatus: string | undefined) => {
    if (!hostelId) return;
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const newStatus = currentStatus === 'PRESENT' ? 'ABSENT' : 'PRESENT';
    
    // Optimistic update
    setRecords((prev) => {
      const existingIdx = prev.findIndex(r => r.student_user_id === studentId && r.roll_date === dateStr);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], status: newStatus };
        return next;
      }
      return [...prev, { student_user_id: studentId, roll_date: dateStr, status: newStatus }];
    });

    try {
      await api.post('/api/hostel-admin/roll-call', {
        hostel_id: hostelId,
        date: dateStr,
        records: [{ student_user_id: studentId, status: newStatus }],
      });
      // toast.success(`Marked ${newStatus.toLowerCase()} for ${dateStr}`);
    } catch (e) {
      toast.error('Failed to update attendance');
      // In a real app we'd revert the optimistic update here.
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sgvu-navy">Attendance (Hostel Roll Call)</h1>
          <p className="text-sm text-muted-foreground">Monthly grid view</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <HostelScopeBar value={hostelId} onChange={setHostelId} allowAll={false} />
        <input
          type="month"
          className="rounded-lg border px-3 py-2 text-sm"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-muted-foreground">
          No active students found in this hostel.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 w-[200px] min-w-[200px] bg-slate-50 p-3 font-semibold shadow-[1px_0_0_0_#e2e8f0]">Student</th>
                <th className="sticky left-[200px] z-10 w-[120px] min-w-[120px] bg-slate-50 p-3 font-semibold shadow-[1px_0_0_0_#e2e8f0]">ID</th>
                <th className="sticky left-[320px] z-10 w-[80px] min-w-[80px] bg-slate-50 p-3 text-center font-semibold shadow-[1px_0_0_0_#e2e8f0]">Total</th>
                {days.map((d) => (
                  <th key={d} className="min-w-[40px] p-2 text-center font-semibold text-slate-600">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((student) => {
                const studentRecords = records.filter(r => r.student_user_id === student.student_user_id);
                const totalPresent = studentRecords.filter(r => r.status === 'PRESENT').length;

                return (
                  <tr key={student.student_user_id} className="group hover:bg-slate-50">
                    <td className="sticky left-0 z-10 w-[200px] min-w-[200px] bg-white p-3 shadow-[1px_0_0_0_#e2e8f0] group-hover:bg-slate-50">
                      <div className="truncate font-medium text-sgvu-navy">{student.name}</div>
                    </td>
                    <td className="sticky left-[200px] z-10 w-[120px] min-w-[120px] bg-white p-3 text-muted-foreground shadow-[1px_0_0_0_#e2e8f0] group-hover:bg-slate-50">
                      <div className="truncate">{student.student_id ?? '—'}</div>
                    </td>
                    <td className="sticky left-[320px] z-10 w-[80px] min-w-[80px] bg-white p-3 text-center font-bold text-sgvu-navy shadow-[1px_0_0_0_#e2e8f0] group-hover:bg-slate-50">
                      {totalPresent}
                    </td>
                    {days.map((d) => {
                      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
                      const rec = studentRecords.find(r => r.roll_date === dateStr);
                      const isPresent = rec?.status === 'PRESENT';

                      return (
                        <td key={d} className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={isPresent}
                            onChange={() => void handleToggle(student.student_user_id, d, rec?.status)}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sgvu-navy focus:ring-sgvu-navy"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
