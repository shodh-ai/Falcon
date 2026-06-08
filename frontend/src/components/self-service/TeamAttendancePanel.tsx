'use client';

import { Suspense, useEffect, useState } from 'react';
import { Download, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { TeamScopeBar, useTeamScope, type TeamScope } from '@/components/self-service/TeamScopeBar';
import { useAuthedApi } from '@/lib/api';

type MatrixDay = {
  date: string;
  top_line: string;
  bottom_line: string;
  color: 'red' | 'yellow' | 'green' | 'gray';
};

type MatrixPayload = {
  month: string;
  days_in_month: number;
  employees: Array<{
    user_id: string;
    name: string;
    employee_id: string | null;
    days: MatrixDay[];
  }>;
};

const CELL_BG: Record<MatrixDay['color'], string> = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  yellow: 'bg-amber-50 text-amber-900 border-amber-200',
  gray: 'bg-gray-50 text-gray-500 border-gray-200',
};

type Props = {
  defaultScope?: TeamScope;
};

function AttendanceContent({ defaultScope }: Props) {
  const api = useAuthedApi();
  const scope = useTeamScope(defaultScope);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    void api
      .get<MatrixPayload>(`/api/hr/ess/team/attendance?scope=${scope}&month=${month}`)
      .then(setData)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load matrix');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [api, scope, month]);

  async function downloadExcel() {
    setExporting(true);
    try {
      const token = localStorage.getItem('falcon_token');
      const tenant = localStorage.getItem('falcon_tenant');
      const res = await fetch(
        `/api/hr/ess/team/attendance/export?scope=${scope}&month=${month}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenant ? { 'x-tenant-subdomain': tenant } : {}),
          },
        },
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team-attendance-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const dayNums = Array.from({ length: data?.days_in_month ?? 31 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <TeamScopeBar defaultScope={defaultScope} />
      </Suspense>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        />
        <Button variant="outline" disabled={exporting} onClick={() => void downloadExcel()}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download Excel
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      )}

      {!loading && data && data.employees.length === 0 && (
        <HrEmptyState
          icon={Users}
          title="No team members"
          description="Try a different scope (Direct, Indirect, or Department)."
        />
      )}

      {!loading && data && data.employees.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-max w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-3 py-2 text-left font-semibold text-sgvu-navy">
                  Team Member
                </th>
                {dayNums.map((d) => (
                  <th key={d} className="min-w-[72px] px-1 py-2 text-center font-medium text-muted-foreground">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp) => {
                const dayMap = new Map(emp.days.map((d) => [Number(d.date.slice(8, 10)), d]));
                return (
                  <tr key={emp.user_id} className="border-b">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <HrPersonCell name={emp.name} subtitle={emp.employee_id ?? undefined} />
                    </td>
                    {dayNums.map((d) => {
                      const cell = dayMap.get(d);
                      if (!cell) {
                        return (
                          <td key={d} className="px-0.5 py-1">
                            <div className="h-12 rounded border border-dashed border-gray-200 bg-gray-50/50" />
                          </td>
                        );
                      }
                      return (
                        <td key={d} className="px-0.5 py-1">
                          <div
                            className={`flex h-12 flex-col justify-center rounded border px-1 text-center leading-tight ${CELL_BG[cell.color]}`}
                          >
                            <span className="text-[10px] font-semibold">{cell.top_line}</span>
                            <span className="text-[9px] opacity-90">{cell.bottom_line}</span>
                          </div>
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

export function TeamAttendancePanel({ defaultScope = 'direct' }: Props) {
  return (
    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin" />}>
      <AttendanceContent defaultScope={defaultScope} />
    </Suspense>
  );
}
