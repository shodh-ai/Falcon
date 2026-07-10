'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  CalendarClock,
  GraduationCap,
  TrendingUp,
  Download,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { downloadAuthedFile } from '@/lib/hod-download';
import { toast } from '@/lib/notifications/falcon-toast';

type DepartmentReportsPayload = {
  department_name: string;
  metrics: {
    total_students: number;
    average_attendance: number;
    attendance_trend_pct: number;
    attendance_trend_label: string;
    lms_completion_pct: number;
    syllabus_behind_count: number;
    target_pass_rate: number;
    total_faculty: number;
  };
  weekly_attendance: Array<{ week: string; attendance: number; target: number }>;
  workload_distribution: {
    balanced: number;
    overloaded: number;
    underutilized: number;
  };
  syllabus_coverage: Array<{ course: string; actual: number; planned: number }>;
  courses_summary: Array<{
    code: string;
    name: string;
    enrolled: number;
    passRate: number;
    syllabus: string;
  }>;
};

const WORKLOAD_COLORS = ['#10B981', '#EF4444', '#64748B'];

export default function HodReportsPage() {
  const { token } = useAuth();
  const api = useAuthedApi();
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DepartmentReportsPayload | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const payload = await api.get<DepartmentReportsPayload>(
          '/api/academics/hod/department-reports',
        );
        setData(payload);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load department reports');
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [api]);

  const attendanceData = data?.weekly_attendance ?? [];
  const syllabusProgressData = data?.syllabus_coverage ?? [];
  const workloadDistribution = useMemo(
    () => [
      {
        name: 'Balanced Load',
        value: data?.workload_distribution.balanced ?? 0,
        color: WORKLOAD_COLORS[0],
      },
      {
        name: 'Overloaded (>18h)',
        value: data?.workload_distribution.overloaded ?? 0,
        color: WORKLOAD_COLORS[1],
      },
      {
        name: 'Underutilized',
        value: data?.workload_distribution.underutilized ?? 0,
        color: WORKLOAD_COLORS[2],
      },
    ],
    [data],
  );
  const coursesSummary = data?.courses_summary ?? [];
  const metrics = data?.metrics;

  async function exportAuditPack() {
    if (!token) {
      toast.error('Please sign in to export');
      return;
    }
    setExporting(true);
    try {
      await downloadAuthedFile(
        '/api/academics/hod/faculty-audit/export',
        token,
        `department-audit-pack-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success('Audit pack downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Department Reports & Analytics"
        description={
          data?.department_name
            ? `Live metrics for ${data.department_name} from the command center.`
            : 'Access visual metrics, performance trends, and compliance reports for your department.'
        }
        actions={
          <Button
            size="default"
            className="h-9 gap-2 bg-sgvu-navy hover:bg-sgvu-navy/90 text-white rounded-xl text-sm font-semibold"
            disabled={exporting || loading}
            onClick={() => void exportAuditPack()}
          >
            <Download className="h-4 w-4 text-sgvu-gold" />
            {exporting ? 'Exporting…' : 'Export Audit Pack'}
          </Button>
        }
      />

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
        </div>
      )}

      {!loading && (
        <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Department Size</p>
              <h3 className="text-2xl font-black text-sgvu-navy mt-1">{metrics?.total_students ?? 0}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active enrolled students</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sgvu-navy border border-slate-100">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Avg Attendance</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">
                {(metrics?.average_attendance ?? 0).toFixed(1)}%
              </h3>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                {metrics?.attendance_trend_label ?? 'No trend data'}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 border border-emerald-100">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">LMS Completion</p>
              <h3 className="text-2xl font-black text-sgvu-navy mt-1">
                {(metrics?.lms_completion_pct ?? 0).toFixed(1)}%
              </h3>
              <p className="text-[10px] text-amber-600 mt-0.5">
                {metrics?.syllabus_behind_count
                  ? `${metrics.syllabus_behind_count} course(s) behind planned syllabus`
                  : 'Syllabus on track'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sgvu-navy border border-slate-100">
              <CalendarClock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Avg Pass Rate</p>
              <h3 className="text-2xl font-black text-sgvu-navy mt-1">
                {(metrics?.target_pass_rate ?? 0).toFixed(1)}%
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">From compiled result analytics</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sgvu-navy border border-slate-100">
              <GraduationCap className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8 border-slate-100 bg-white shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
            <CardTitle className="text-sm font-bold text-sgvu-navy">Weekly Student Attendance Progression</CardTitle>
            <CardDescription className="text-[11px]">
              Attendance levels compiled across department batches vs threshold target of 75%.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {attendanceData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No attendance history for this department yet.</p>
            ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attendanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F172A" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#0F172A" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="week" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" name="Actual Attendance" dataKey="attendance" stroke="#0F172A" strokeWidth={2.5} fillOpacity={1} fill="url(#attendanceGrad)" />
                  <Area type="monotone" name="Min Compliance SLA" dataKey="target" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="5 5" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-slate-100 bg-white shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
            <CardTitle className="text-sm font-bold text-sgvu-navy">Faculty Workload Distribution</CardTitle>
            <CardDescription className="text-[11px]">Breakdown of staff workload classifications.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col justify-between items-center h-[312px]">
            <div className="h-44 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workloadDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {workloadDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full space-y-2 text-xs">
              {workloadDistribution.map((w, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-slate-50 pb-1.5 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: w.color }} />
                    <span className="text-muted-foreground">{w.name}</span>
                  </div>
                  <span className="font-bold text-sgvu-navy">{w.value} Faculty</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6 border-slate-100 bg-white shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
            <CardTitle className="text-sm font-bold text-sgvu-navy">Syllabus Coverage: Planned vs. Actual</CardTitle>
            <CardDescription className="text-[11px]">Compare current LMS coverage units with planned syllabi milestones.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {syllabusProgressData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No syllabus coverage data yet.</p>
            ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={syllabusProgressData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="course" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar name="Actual Coverage" dataKey="actual" fill="#0F172A" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar name="Planned Milestones" dataKey="planned" fill="#94A3B8" fillOpacity={0.4} radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-6 space-y-6">
          <HodPanel title="Courses Compliance Overview">
            {coursesSummary.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No course result data for this department yet.</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 pb-2 text-muted-foreground uppercase font-bold tracking-wider">
                    <th className="py-2.5 pl-2">Code</th>
                    <th className="py-2.5">Course Name</th>
                    <th className="py-2.5 text-center">Enrolled</th>
                    <th className="py-2.5 text-center">Pass Rate</th>
                    <th className="py-2.5 text-right pr-2">Syllabus</th>
                  </tr>
                </thead>
                <tbody>
                  {coursesSummary.map((course) => (
                    <tr key={course.code} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition">
                      <td className="py-3 pl-2 font-bold text-sgvu-navy">{course.code}</td>
                      <td className="py-3 font-medium text-sgvu-navy">{course.name}</td>
                      <td className="py-3 text-center tabular-nums text-muted-foreground">{course.enrolled}</td>
                      <td className="py-3 text-center font-bold text-emerald-600 tabular-nums">{course.passRate}%</td>
                      <td className="py-3 text-right pr-2">
                        <span className={cn(
                          "rounded px-2 py-0.5 font-semibold text-[10px]",
                          course.syllabus === 'Ahead' ? "bg-emerald-50 text-emerald-700" :
                          course.syllabus === 'Behind' ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"
                        )}>
                          {course.syllabus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </HodPanel>
        </div>
      </div>
        </>
      )}
    </HodPageFrame>
  );
}
