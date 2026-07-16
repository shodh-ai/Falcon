'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type ResultRow = {
  course_id: string;
  course_code: string;
  course_name: string;
  enrolled: number;
  passed: number;
  failed: number;
  pass_percent: number;
};

const PIE_COLORS = ['#166534', '#ef4444', '#64748b'];

export default function DeanResultAnalyticsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<ResultRow[]>('/api/academics/dean/result-analytics');
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load result analytics');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const summary = useMemo(() => {
    const enrolled = rows.reduce((sum, row) => sum + row.enrolled, 0);
    const passed = rows.reduce((sum, row) => sum + row.passed, 0);
    const failed = rows.reduce((sum, row) => sum + row.failed, 0);
    const graded = passed + failed;
    const passRate = graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0;
    const atRisk = rows.filter((row) => row.pass_percent < 75).length;
    return { enrolled, passed, failed, passRate, atRisk, courses: rows.length };
  }, [rows]);

  const pieData = useMemo(
    () => [
      { name: 'Passed', value: summary.passed },
      { name: 'Failed', value: summary.failed },
      {
        name: 'Ungraded',
        value: Math.max(0, summary.enrolled - summary.passed - summary.failed),
      },
    ].filter((row) => row.value > 0),
    [summary],
  );

  const barData = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => a.pass_percent - b.pass_percent)
        .slice(0, 12)
        .map((row) => ({
          course: row.course_code,
          pass_rate: row.pass_percent,
        })),
    [rows],
  );

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Result Analytics"
        description="School-scoped pass rates and course performance across your departments."
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <HodMetricChip label="Courses" value={summary.courses} emphasis />
            <HodMetricChip label="Pass Rate" value={`${summary.passRate}%`} />
            <HodMetricChip label="At Risk Courses" value={summary.atRisk} />
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          No graded course results found for your school yet.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <HodPanel title="Overall Outcomes">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </HodPanel>

          <HodPanel title="Courses Below 75% Pass Rate">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="course" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="pass_rate" fill="#1e3a5f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </HodPanel>

          <HodPanel title="Course Summary" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2">Course</th>
                    <th className="px-4 py-2">Enrolled</th>
                    <th className="px-4 py-2">Passed</th>
                    <th className="px-4 py-2">Failed</th>
                    <th className="px-4 py-2">Pass %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.course_id} className="border-b border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sgvu-navy">{row.course_code}</p>
                        <p className="text-muted-foreground">{row.course_name}</p>
                      </td>
                      <td className="px-4 py-3">{row.enrolled}</td>
                      <td className="px-4 py-3">{row.passed}</td>
                      <td className="px-4 py-3">{row.failed}</td>
                      <td className="px-4 py-3 font-medium">{row.pass_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HodPanel>
        </div>
      )}
    </HodPageFrame>
  );
}
