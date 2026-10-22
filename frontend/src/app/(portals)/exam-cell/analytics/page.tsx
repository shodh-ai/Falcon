'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import { normalizeFacultyPerformance } from '@/lib/exam-cell/format';

type Analytics = {
  semester: number;
  grade_distribution: { grade: string; count: number }[];
  subject_analysis: { subject_code: string; subject_name: string; avg_marks: number; students: number }[];
  faculty_performance: { name?: string; faculty_name?: string; submissions?: number; papers_evaluated?: number }[];
  pass_fail: { label: string; count: number }[];
};

const PIE_COLORS = ['#1e3a5f', '#c9a227', '#059669', '#dc2626', '#6366f1'];

function csvText(value: string): string {
  // Quoting preserves field boundaries; an apostrophe prevents spreadsheet formulas in text fields.
  const text = /^\s*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function ExamCellAnalyticsPage() {
  const api = useAuthedApi();
  const [semester, setSemester] = useState('4');
  const [revision, setRevision] = useState(0);
  const request = useMemo(() => ({ api, semester, revision }), [api, semester, revision]);
  const [result, setResult] = useState<{ request: typeof request; data: Analytics | null; error: string | null } | null>(null);
  const currentResult = result?.request === request ? result : null;
  const loading = !currentResult;
  const data = currentResult?.data;
  const error = currentResult?.error;

  useEffect(() => {
    let current = true;
    const { api, semester } = request;
    void api.get<Analytics>(`/api/exam-cell/analytics/advanced?semester=${semester}`)
      .then((data) => {
        if (current) setResult({ request, data, error: null });
      }).catch((cause: unknown) => {
        if (current) setResult({ request, data: null, error: cause instanceof Error ? cause.message : 'Failed to load analytics' });
      });
    return () => { current = false; };
  }, [request]);

  function exportCsv() {
    if (!data || loading || error) return;
    const lines = data.subject_analysis.map((s) =>
      [csvText(s.subject_code), csvText(s.subject_name), s.avg_marks, s.students].join(','),
    );
    const csv = ['Code,Name,Avg Marks,Students', ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam-analytics-sem${semester}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const subjectColumns: DataTableColumn<Analytics['subject_analysis'][0]>[] = [
    { key: 'code', header: 'Code', render: (r) => r.subject_code },
    { key: 'name', header: 'Subject', render: (r) => r.subject_name },
    { key: 'avg', header: 'Avg marks', render: (r) => Number(r.avg_marks).toFixed(1) },
    { key: 'students', header: 'Students', render: (r) => r.students },
  ];

  const facultyChart = useMemo(
    () => normalizeFacultyPerformance(data?.faculty_performance ?? []),
    [data?.faculty_performance],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader pageId="analytics" actions={
            <div className="flex gap-2">
              <Input aria-label="Semester" type="number" className="w-20" value={semester} onChange={(e) => setSemester(e.target.value)} />
              <Button
                variant="outline"
                size="sm"
                className="h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60"
                onClick={exportCsv}
                disabled={loading || !!error || !data}
              >
                Export CSV
              </Button>
            </div>
          } />
        </CardContent>
      </Card>
      {loading ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading analytics…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setRevision((current) => current + 1)}>Retry analytics</Button>
        </div>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Pass / fail distribution</CardTitle></CardHeader>
            <CardContent className="h-64">
              {(data.pass_fail ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No result data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.pass_fail.map((r) => ({ name: r.label, count: r.count }))}>
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
            <CardHeader><CardTitle className="text-base">Grade distribution</CardTitle></CardHeader>
            <CardContent className="h-64">
              {(data.grade_distribution ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No grade data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.grade_distribution} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={80} label>
                      {data.grade_distribution.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Subject analysis</CardTitle></CardHeader>
            <CardContent>
              <DataTable columns={subjectColumns} rows={data.subject_analysis} rowKey={(r) => r.subject_code} emptyMessage="No subject result data." />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Faculty marks submission performance</CardTitle></CardHeader>
            <CardContent className="h-64">
              {(facultyChart ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No faculty submission data.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={facultyChart} layout="vertical">
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="submissions" fill="#c9a227" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
