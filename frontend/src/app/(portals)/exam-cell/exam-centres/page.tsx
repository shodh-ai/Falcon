'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

import { formatFacilities } from '@/lib/exam-cell/format';

type Centre = {
  space_id: string;
  building_name: string;
  room_number: string;
  capacity: number | null;
  status: string;
  facilities: unknown;
};

function formatFacilitiesCell(facilities: Centre['facilities']): string {
  return formatFacilities(facilities);
}

export default function ExamCellExamCentresPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Centre[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Centre[]>('/api/exam-cell/exam-centres'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load exam centres');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<Centre>[] = [
    { key: 'building', header: 'Building', render: (r) => r.building_name },
    { key: 'room', header: 'Room / Hall', render: (r) => r.room_number },
    { key: 'capacity', header: 'Capacity', render: (r) => r.capacity ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge variant="outline">{r.status ?? 'ACTIVE'}</Badge> },
    { key: 'facilities', header: 'Facilities', render: (r) => (
      <span className="text-xs text-muted-foreground">{formatFacilitiesCell(r.facilities)}</span>
    ) },
  ];

  const totalCapacity = rows.reduce((s, r) => s + (r.capacity ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="exam-centres" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Total rooms</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{rows.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Total capacity</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{totalCapacity}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Buildings</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{new Set(rows.map((r) => r.building_name)).size}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Exam halls & rooms</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.space_id} emptyMessage="No exam centres configured in campus spaces." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
