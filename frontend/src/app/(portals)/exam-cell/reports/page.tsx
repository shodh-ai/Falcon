'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type ReportSummary = {
  semester: number;
  pass_fail: { label: string; count: number }[];
  pass_percentage: number;
  top_rankers: Array<{ name: string; enrollment_number: string | null; cgpa: number | null; sgpa: number | null }>;
  department_enrollment: Array<{ department: string; students: number }>;
  pending_backlog: number;
};

export default function ExamCellReportsPage() {
  const api = useAuthedApi();
  const [semester, setSemester] = useState('4');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await api.get<ReportSummary>(`/api/exam-cell/reports/summary?semester=${semester}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load reports');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [api, semester]);

  useEffect(() => { void load(); }, [load]);

  const chartData = (summary?.pass_fail ?? []).map((r) => ({
    name: r.label.replace(/_/g, ' '),
    count: r.count,
  }));

  const rankColumns: DataTableColumn<ReportSummary['top_rankers'][0]>[] = [
    { key: 'rank', header: '#', render: (_r, i) => i + 1 },
    { key: 'name', header: 'Student', render: (r) => r.name },
    { key: 'enrollment', header: 'Enrollment', render: (r) => r.enrollment_number ?? '—' },
    { key: 'cgpa', header: 'CGPA', render: (r) => r.cgpa?.toFixed(2) ?? '—' },
    { key: 'sgpa', header: 'SGPA', render: (r) => r.sgpa?.toFixed(2) ?? '—' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="reports" actions={
        <Input type="number" className="w-24" value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Sem" />
      } />

      {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Pass percentage</CardTitle></CardHeader><CardContent><p className="text-3xl font-black text-sgvu-navy">{summary.pass_percentage}%</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Pending backlog</CardTitle></CardHeader><CardContent><p className="text-3xl font-black">{summary.pending_backlog}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Departments</CardTitle></CardHeader><CardContent><p className="text-3xl font-black">{summary.department_enrollment.length}</p></CardContent></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Result distribution</CardTitle></CardHeader>
              <CardContent className="h-64">
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No declared results for this semester.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Department enrollment</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {summary.department_enrollment.map((d) => (
                  <div key={d.department} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{d.department}</span>
                    <Badge>{d.students} students</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Top rankers — Semester {summary.semester}</CardTitle></CardHeader>
            <CardContent>
              <DataTable columns={rankColumns} rows={summary.top_rankers} rowKey={(r) => r.enrollment_number ?? r.name} emptyMessage="No grade cards generated for this semester." />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
