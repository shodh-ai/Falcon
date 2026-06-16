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
        'inline-block rounded-md border px-2 py-0.5 text-xs font-semibold uppercase',
        status === 'OVERLOADED' && 'border-sgvu-gold/50 bg-sgvu-gold/10 text-sgvu-navy',
        status === 'UNDERUTILIZED' && 'border-slate-200 bg-slate-50 text-muted-foreground',
        status === 'BALANCED' && 'border-sgvu-navy/20 bg-sgvu-navy/5 text-sgvu-navy',
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
                <p className="text-muted-foreground">{r.email}</p>
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
