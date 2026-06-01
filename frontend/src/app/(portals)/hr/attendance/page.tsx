'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type DayCell = {
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE';
  leave_status?: string;
};

type MatrixEmployee = {
  user_id: string;
  name: string;
  days: DayCell[];
};

type MatrixData = {
  month: string;
  employees: MatrixEmployee[];
};

function dayLabel(date: string) {
  return String(new Date(`${date}T12:00:00`).getDate());
}

function statusGlyph(day: DayCell) {
  if (day.status === 'PRESENT') return 'P';
  if (day.status === 'LEAVE') return 'L';
  return 'A';
}

function statusClass(day: DayCell) {
  if (day.status === 'PRESENT') return 'bg-emerald-100 text-emerald-700';
  if (day.status === 'LEAVE') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export default function HrAttendancePage() {
  const api = useAuthedApi();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    void api.get<MatrixData>(`/api/hr/attendance/matrix?month=${month}`).then(setMatrix);
  };

  useEffect(() => {
    load();
  }, [api, month]);

  async function syncBiometric() {
    setSyncing(true);
    try {
      const result = await api.post<{ processed: number }>('/api/hr/biometric-sync', {});
      toast.success(`Processed ${result.processed ?? 0} biometric punches`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const dayColumns = matrix?.employees[0]?.days ?? [];

  return (
    <div className="mx-auto max-w-[95vw] space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Attendance & Biometrics"
        description="Daily master matrix with automatic Late / Half-Day rules from biometric device sync."
        actions={
          <div className="flex gap-2">
            <input
              type="month"
              className="rounded-md border px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncBiometric()}>
              {syncing ? 'Syncing…' : 'Process biometric queue'}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Master matrix — {month}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {matrix && matrix.employees.length > 0 ? (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-background p-2 text-left">Employee</th>
                  {dayColumns.map((d) => (
                    <th key={d.date} className="p-1 text-center" title={d.date}>
                      {dayLabel(d.date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.employees.map((emp) => (
                  <tr key={emp.user_id} className="border-b border-border/30">
                    <td className="sticky left-0 bg-background p-2 font-medium">{emp.name}</td>
                    {dayColumns.map((col, idx) => {
                      const day = emp.days[idx];
                      if (!day) {
                        return (
                          <td key={col.date} className="p-1 text-center">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={day.date} className="p-1 text-center">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${statusClass(day)}`}
                            title={day.leave_status ? `${day.status} (${day.leave_status})` : day.status}
                          >
                            {statusGlyph(day)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance data for this month.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
