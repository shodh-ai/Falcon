'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { formatFacilities, parseStringArray } from '@/lib/exam-cell/format';

type Centre = {
  space_id: string;
  building_name: string;
  room_number: string;
  capacity: number | null;
  status: string;
  facilities: unknown;
};

function facilityLabels(facilities: Centre['facilities']): string[] {
  if (facilities == null) return [];
  if (typeof facilities === 'object' && !Array.isArray(facilities)) {
    return Object.entries(facilities as Record<string, unknown>)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key.replace(/_/g, ' '));
  }
  const asList = parseStringArray(facilities);
  if (asList.length > 0) return asList.map((f) => f.replace(/_/g, ' '));
  const plain = formatFacilities(facilities);
  return plain === '—' ? [] : plain.split(',').map((s) => s.trim()).filter(Boolean);
}

function statusTone(status: string): string {
  const key = status.toUpperCase();
  if (key === 'AVAILABLE' || key === 'ACTIVE') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (key === 'MAINTENANCE' || key === 'UNDER_MAINTENANCE') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (key === 'OCCUPIED' || key === 'BOOKED') {
    return 'border-sky-200 bg-sky-50 text-sky-800';
  }
  if (key === 'INACTIVE' || key === 'CLOSED') {
    return 'border-slate-200 bg-slate-50 text-slate-600';
  }
  return 'border-sgvu-navy/15 bg-sgvu-navy/[0.04] text-sgvu-navy';
}

function capacityBand(capacity: number | null): string {
  const n = capacity ?? 0;
  if (n >= 100) return 'Large hall';
  if (n >= 60) return 'Lecture hall';
  if (n >= 30) return 'Classroom';
  if (n > 0) return 'Lab / small';
  return 'Unspecified';
}

export default function ExamCellExamCentresPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Centre[] | { data: Centre[] }>('/api/exam-cell/exam-centres');
      setRows(Array.isArray(res) ? res : (res?.data ?? []));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load exam centres');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildings = useMemo(
    () => [...new Set(rows.map((r) => r.building_name).filter(Boolean))].sort(),
    [rows],
  );

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => (r.status || 'AVAILABLE').toUpperCase()))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (buildingFilter !== 'ALL' && r.building_name !== buildingFilter) return false;
      const status = (r.status || 'AVAILABLE').toUpperCase();
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!q) return true;
      const facilities = facilityLabels(r.facilities).join(' ').toLowerCase();
      return (
        r.building_name.toLowerCase().includes(q) ||
        r.room_number.toLowerCase().includes(q) ||
        status.toLowerCase().includes(q) ||
        facilities.includes(q)
      );
    });
  }, [rows, search, buildingFilter, statusFilter]);

  const totalCapacity = rows.reduce((s, r) => s + (r.capacity ?? 0), 0);
  const filteredCapacity = filtered.reduce((s, r) => s + (r.capacity ?? 0), 0);
  const availableCount = rows.filter((r) => {
    const s = (r.status || 'AVAILABLE').toUpperCase();
    return s === 'AVAILABLE' || s === 'ACTIVE';
  }).length;

  const filterSelectClass =
    'h-10 w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 text-sm font-medium text-sgvu-navy shadow-none transition-colors hover:border-sgvu-navy/40 focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25 data-[state=open]:border-sgvu-gold data-[state=open]:ring-2 data-[state=open]:ring-sgvu-gold/25';
  const actionBtnClass =
    'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

  const columns: DataTableColumn<Centre>[] = [
    {
      key: 'building',
      header: 'Building',
      render: (r) => (
        <div>
          <p className="font-semibold text-sgvu-navy">{r.building_name}</p>
          <p className="text-xs text-muted-foreground">{capacityBand(r.capacity)}</p>
        </div>
      ),
    },
    {
      key: 'room',
      header: 'Room / Hall',
      render: (r) => (
        <span className="inline-flex rounded-md border border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-2.5 py-1 text-sm font-semibold text-sgvu-navy">
          {r.room_number}
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (r) => {
        const cap = r.capacity ?? 0;
        const max = Math.max(totalCapacity / Math.max(rows.length, 1), 1);
        const pct = Math.min(100, Math.round((cap / (max * 1.5)) * 100));
        return (
          <div className="min-w-[7rem]">
            <p className="text-sm font-bold tabular-nums text-sgvu-navy">{cap || '—'} seats</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sgvu-navy/10">
              <div className="h-full rounded-full bg-[#0B2447]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const status = (r.status || 'AVAILABLE').toUpperCase();
        return (
          <Badge variant="outline" className={`font-semibold ${statusTone(status)}`}>
            {status.replace(/_/g, ' ')}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader
            pageId="exam-centres"
            actions={
              <Button
                variant="outline"
                size="sm"
                className={actionBtnClass}
                disabled={loading}
                onClick={() => void load()}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total rooms', value: rows.length },
          { label: 'Total capacity', value: totalCapacity.toLocaleString() },
          { label: 'Buildings', value: buildings.length },
          { label: 'Available now', value: availableCount },
        ].map((stat) => (
          <Card key={stat.label} className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/50">{stat.label}</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-sgvu-navy">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">Exam halls & rooms</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading
                  ? 'Loading rooms…'
                  : `Showing ${filtered.length} of ${rows.length} rooms · ${filteredCapacity.toLocaleString()} seats in view`}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Search</label>
              <Input
                className="h-10 rounded-lg border-sgvu-navy/20 focus-visible:ring-sgvu-gold/40"
                placeholder="Search building or room…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Building</label>
              <Select
                className={filterSelectClass}
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
              >
                <option value="ALL">All buildings</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-sgvu-navy/60">Status</label>
              <Select
                className={filterSelectClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-sgvu-navy" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(r) => r.space_id}
              emptyMessage="No rooms match your filters. Try clearing search or choosing All buildings."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
