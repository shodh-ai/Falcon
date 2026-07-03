'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodDataTable,
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
} from '@/components/hod/HodPagePrimitives';
import { cn } from '@/lib/utils';
import { useAuthedApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';

type Row = {
  user_id: string;
  name: string;
  email: string | null;
  hours_per_week: number;
  course_count: number;
  workload_status: 'OVERLOADED' | 'UNDERUTILIZED' | 'BALANCED';
};

function StatusTag({ status }: { status: Row['workload_status'] }) {
  return (
    <span
      className={cn(
        'inline-block rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider',
        status === 'OVERLOADED' && 'border-red-200 bg-red-50 text-red-700',
        status === 'UNDERUTILIZED' && 'border-slate-200 bg-slate-50 text-muted-foreground',
        status === 'BALANCED' && 'border-green-200 bg-green-50 text-green-700',
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export default function HodFacultyWorkloadPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/hod/faculty-workload');
        setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load workload');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const stats = useMemo(() => {
    const overloaded = rows.filter((r) => r.workload_status === 'OVERLOADED').length;
    const under = rows.filter((r) => r.workload_status === 'UNDERUTILIZED').length;
    const avg =
      rows.length > 0
        ? (rows.reduce((s, r) => s + r.hours_per_week, 0) / rows.length).toFixed(1)
        : '0';
    return { total: rows.length, overloaded, under, avg };
  }, [rows]);

  const chartData = useMemo(() => {
    return rows.map((r) => ({
      name: r.name.split(' ')[0], // Use first name for space optimization
      fullName: r.name,
      hours: r.hours_per_week,
      status: r.workload_status,
    }));
  }, [rows]);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Faculty Roster & Workload"
        description="Teaching hours per week from department timetable."
        meta={
          <>
            <HodMetricChip label="Faculty" value={stats.total} emphasis />
            <HodMetricChip label="Avg hrs/wk" value={stats.avg} />
            <HodMetricChip label="Overloaded" value={stats.overloaded} />
            <HodMetricChip label="Under-utilized" value={stats.under} />
          </>
        }
      />

      {!loading && rows.length > 0 && (
        <Card className="border-gray-100 shadow-sm mb-6 bg-white overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
            <CardTitle className="text-base font-bold text-sgvu-navy flex items-center gap-2">
              Teaching Load Analysis (Hours/Week)
              {stats.overloaded > 0 && (
                <span className="text-xs bg-red-100 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {stats.overloaded} Overloaded (&gt;12 hrs)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="name"
                    stroke="#94A3B8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    unit="h"
                  />
                  <Tooltip
                    cursor={{ fill: '#F8FAFC' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as typeof chartData[number];
                        return (
                          <div className="bg-white p-3 border border-slate-100 rounded-xl shadow-lg space-y-1">
                            <p className="font-bold text-xs text-sgvu-navy">{data.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              Workload: <span className="font-semibold text-sgvu-navy">{data.hours} hrs/week</span>
                            </p>
                            <p className={cn(
                              "text-[10px] font-semibold uppercase tracking-wider",
                              data.status === 'OVERLOADED' ? "text-red-600" :
                              data.status === 'BALANCED' ? "text-green-600" : "text-slate-500"
                            )}>
                              {data.status}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={45}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.hours > 12 ? '#EF4444' : '#0F172A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.user_id}
        empty="No faculty in department scope."
        columns={[
          {
            key: 'name',
            label: 'Faculty',
            render: (r) => (
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-muted-foreground text-xs">{r.email}</p>
              </div>
            ),
          },
          {
            key: 'hours',
            label: 'Hrs / Week',
            className: 'w-24 tabular-nums font-bold',
            render: (r) => `${r.hours_per_week}h`,
          },
          {
            key: 'courses',
            label: 'Courses',
            className: 'w-20',
            render: (r) => r.course_count,
          },
          {
            key: 'status',
            label: 'Status',
            className: 'w-32',
            render: (r) => <StatusTag status={r.workload_status} />,
          },
        ]}
      />
    </HodPageFrame>
  );
}
