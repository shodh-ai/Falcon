'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { formatStringList } from '@/lib/exam-cell/format';

type EligibilityItem = {
  student_user_id: string;
  name?: string;
  student_name?: string;
  enrollment_number: string | null;
  category: string;
  attendance_percent: number;
  fee_clear: boolean;
  block_reasons: string[] | unknown;
};

type Dashboard = {
  semester: number;
  total: number;
  summary: Record<string, number>;
  items: EligibilityItem[];
};

const CATEGORY_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  ELIGIBLE: 'default',
  ATTENDANCE_SHORTAGE: 'destructive',
  FEE_PENDING: 'destructive',
  INTERNAL_MARKS_PENDING: 'secondary',
  DOCUMENTS_PENDING: 'secondary',
  MEDICAL_CASE: 'outline',
  DISCIPLINARY_HOLD: 'destructive',
  DEBARRED: 'destructive',
};

export default function ExamCellEligibilityPage() {
  const api = useAuthedApi();
  const [semester, setSemester] = useState('4');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<Dashboard>(`/api/exam-cell/eligibility/dashboard?semester=${semester}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load eligibility');
    } finally {
      setLoading(false);
    }
  }, [api, semester]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return categoryFilter ? items.filter((i) => i.category === categoryFilter) : items;
  }, [data, categoryFilter]);

  function studentLabel(r: EligibilityItem) {
    return r.name ?? r.student_name ?? '—';
  }

  function exportCsv() {
    const header = ['Name', 'Enrollment', 'Category', 'Attendance %', 'Fee Clear', 'Block Reasons'];
    const lines = rows.map((r) =>
      [studentLabel(r), r.enrollment_number ?? '', r.category, r.attendance_percent, r.fee_clear ? 'Yes' : 'No', formatStringList(r.block_reasons, '; ')]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eligibility-sem${semester}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: DataTableColumn<EligibilityItem>[] = [
    { key: 'name', header: 'Student', render: (r) => (
      <div><p className="font-medium">{studentLabel(r)}</p><p className="text-xs text-muted-foreground">{r.enrollment_number ?? '—'}</p></div>
    ) },
    { key: 'category', header: 'Status', render: (r) => (
      <Badge variant={CATEGORY_VARIANT[r.category] ?? 'outline'}>{r.category.replace(/_/g, ' ')}</Badge>
    ) },
    { key: 'attendance', header: 'Attendance', render: (r) => `${r.attendance_percent}%` },
    { key: 'fee', header: 'Fee', render: (r) => r.fee_clear ? 'Clear' : 'Pending' },
    { key: 'reasons', header: 'Block reasons', render: (r) => (
      <span className="text-xs text-muted-foreground">{formatStringList(r.block_reasons)}</span>
    ) },
  ];

  const summaryCards = Object.entries(data?.summary ?? {});

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="eligibility" actions={
        <div className="flex items-center gap-2">
          <Select className="rounded-md border px-2 py-1 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} title="Export CSV">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      } />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(([cat, count]) => (
          <Card key={cat} className="cursor-pointer transition hover:border-sgvu-gold/40" onClick={() => setCategoryFilter(cat)}>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{cat.replace(/_/g, ' ')}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-black tabular-nums">{count}</p></CardContent>
          </Card>
        ))}
        {data ? (
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Total students</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{data.total}</p></CardContent></Card>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Eligibility register</CardTitle>
          <div className="flex gap-2">
            <Select className="rounded-md border px-2 py-1 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {summaryCards.map(([cat]) => <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>)}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.student_user_id} emptyMessage="No students enrolled for this semester." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
