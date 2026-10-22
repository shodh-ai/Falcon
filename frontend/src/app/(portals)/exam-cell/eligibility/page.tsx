'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PaginationBar } from '@/components/ui/PaginationBar';

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
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await api.get<Dashboard>(`/api/exam-cell/eligibility/dashboard?semester=${semester}`);
      if (requestId.current === currentRequest) setData(response);
    } catch (e) {
      if (requestId.current === currentRequest) {
        const message = e instanceof Error ? e.message : 'Failed to load eligibility';
        setError(message);
        toast.error(message);
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [api, semester]);

  useEffect(() => {
    void Promise.resolve().then(load);
    return () => { requestId.current += 1; };
  }, [load]);

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
  const pageOffset = Math.min(offset, Math.max(0, Math.ceil(rows.length / 20) - 1) * 20);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="eligibility" actions={
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
              <label htmlFor="eligibility-semester" className="block text-xs font-semibold text-sgvu-navy">Semester</label>
              <Select
                id="eligibility-semester"
                value={semester}
                onChange={(e) => { setSemester(e.target.value); setOffset(0); setCategoryFilter(''); }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
              </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
                onClick={exportCsv}
                title="Export CSV"
                aria-label="Export eligibility CSV"
                disabled={loading || !!error || rows.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          } />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(([cat, count]) => (
          <button key={cat} type="button" aria-pressed={categoryFilter === cat} className="rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition hover:border-sgvu-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-gold aria-pressed:border-sgvu-gold aria-pressed:bg-sgvu-gold/5" onClick={() => { setCategoryFilter(cat); setOffset(0); }}>
            <span className="block text-xs font-semibold uppercase text-muted-foreground">{cat.replace(/_/g, ' ')}</span>
            <span className="mt-3 block text-2xl font-bold tabular-nums text-sgvu-navy">{count}</span>
          </button>
        ))}
        {data ? (
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Total students</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{data.total}</p></CardContent></Card>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Eligibility register</CardTitle>
          <div className="space-y-1.5">
            <label htmlFor="eligibility-category" className="block text-xs font-semibold text-sgvu-navy">Eligibility status</label>
            <Select
              id="eligibility-category"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setOffset(0); }}
            >
              <option value="">All categories</option>
              {summaryCards.map(([cat]) => <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>)}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Loading eligibility…</div> : error ? (
            <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button></div>
          ) : <>
            <DataTable columns={columns} rows={rows.slice(pageOffset, pageOffset + 20)} rowKey={(r) => r.student_user_id} emptyMessage={categoryFilter ? 'No students match this eligibility status.' : 'No students enrolled for this semester.'} />
            <PaginationBar total={rows.length} limit={20} offset={pageOffset} onPageChange={setOffset} />
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
