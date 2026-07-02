'use client';

import { useMemo } from 'react';
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
  Cell
} from 'recharts';
import { 
  Users, 
  CalendarClock, 
  GraduationCap, 
  TrendingUp, 
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function HodReportsPage() {
  // Mock data for charts
  const attendanceData = useMemo(() => [
    { week: 'Week 1', attendance: 88, target: 75 },
    { week: 'Week 2', attendance: 89, target: 75 },
    { week: 'Week 3', attendance: 87, target: 75 },
    { week: 'Week 4', attendance: 85, target: 75 },
    { week: 'Week 5', attendance: 91, target: 75 },
    { week: 'Week 6', attendance: 90, target: 75 },
    { week: 'Week 7', attendance: 88, target: 75 },
    { week: 'Week 8', attendance: 86, target: 75 },
    { week: 'Week 9', attendance: 93, target: 75 },
    { week: 'Week 10', attendance: 92, target: 75 },
  ], []);

  const syllabusProgressData = useMemo(() => [
    { course: 'CS-301', actual: 80, planned: 85 },
    { course: 'CS-302', actual: 95, planned: 90 },
    { course: 'CS-303', actual: 70, planned: 80 },
    { course: 'CS-304', actual: 88, planned: 85 },
    { course: 'CS-305', actual: 60, planned: 75 },
    { course: 'CS-306', actual: 90, planned: 90 },
  ], []);

  const workloadDistribution = useMemo(() => [
    { name: 'Balanced Load', value: 12, color: '#10B981' },     // Green
    { name: 'Overloaded (>12h)', value: 3, color: '#EF4444' },  // Red
    { name: 'Underutilized', value: 2, color: '#64748B' },     // Slate
  ], []);

  const coursesSummary = useMemo(() => [
    { code: 'CS-301', name: 'Database Management Systems', enrolled: 120, passRate: 92, syllabus: 'On Track' },
    { code: 'CS-302', name: 'Computer Networks', enrolled: 120, passRate: 88, syllabus: 'Ahead' },
    { code: 'CS-303', name: 'Operating Systems', enrolled: 118, passRate: 74, syllabus: 'Behind' },
    { code: 'CS-304', name: 'Theory of Computation', enrolled: 115, passRate: 81, syllabus: 'On Track' },
    { code: 'CS-305', name: 'Software Engineering', enrolled: 110, passRate: 85, syllabus: 'Behind' },
  ], []);

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Department Reports & Analytics"
        description="Access visual metrics, performance trends, and compliance reports for your department."
        actions={
          <Button size="default" className="h-9 gap-2 bg-sgvu-navy hover:bg-sgvu-navy/90 text-white rounded-xl text-sm font-semibold">
            <Download className="h-4 w-4 text-sgvu-gold" />
            Export Audit Pack
          </Button>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Department Size</p>
              <h3 className="text-2xl font-black text-sgvu-navy mt-1">684</h3>
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
              <h3 className="text-2xl font-black text-emerald-600 mt-1">89.2%</h3>
              <p className="text-[10px] text-emerald-600 mt-0.5">+1.4% change this week</p>
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
              <h3 className="text-2xl font-black text-sgvu-navy mt-1">81.8%</h3>
              <p className="text-[10px] text-amber-600 mt-0.5">2 courses behind planned syllabus</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sgvu-navy border border-slate-100">
              <CalendarClock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 bg-white shadow-sm">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Target Pass Rate</p>
              <h3 className="text-2xl font-black text-sgvu-navy mt-1">85.0%</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Target SLA for exams</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sgvu-navy border border-slate-100">
              <GraduationCap className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Attendance Progression Chart */}
        <Card className="lg:col-span-8 border-slate-100 bg-white shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
            <CardTitle className="text-sm font-bold text-sgvu-navy">Weekly Student Attendance Progression</CardTitle>
            <CardDescription className="text-[11px]">Attendance levels compiled across all batches vs threshold target of 75%.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
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
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} domain={[50, 100]} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" name="Actual Attendance" dataKey="attendance" stroke="#0F172A" strokeWidth={2.5} fillOpacity={1} fill="url(#attendanceGrad)" />
                  <Area type="monotone" name="Min Compliance SLA" dataKey="target" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="5 5" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Workload Distribution Pie Chart */}
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
            
            {/* Legends */}
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
        {/* Syllabus Coverage Bar Chart */}
        <Card className="lg:col-span-6 border-slate-100 bg-white shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
            <CardTitle className="text-sm font-bold text-sgvu-navy">Syllabus Coverage: Planned vs. Actual</CardTitle>
            <CardDescription className="text-[11px]">Compare current LMS coverage units with planned syllabi milestones.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
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
          </CardContent>
        </Card>

        {/* Academic Performance Summary */}
        <div className="lg:col-span-6 space-y-6">
          <HodPanel title="Courses Compliance Overview">
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
          </HodPanel>
        </div>
      </div>
    </HodPageFrame>
  );
}
