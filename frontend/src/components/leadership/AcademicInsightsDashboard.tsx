'use client';

import { Select } from '@/components/ui/select';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend
} from 'recharts';
import { Trophy, AlertTriangle, TrendingUp, Users } from 'lucide-react';

type BatchData = {
  year: number;
  midTerm: { red: number; yellow: number; green: number };
  endTerm: { AA: number; AB: number; BB: number; BC: number; CC: number; CD: number; DD: number; F: number };
};

type AdvancedData = {
  years: BatchData[];
  summary: { excellenceRate: number; riskRate: number };
  comparative: {
    departmentWise: { department: string; avgCgpa: number; passRate: number }[];
    cohortProgression: { batch: string; avgCgpa: number }[];
  };
  outliers: { bottlenecks: { courseCode: string; courseName: string; failureRate: number }[] };
  correlative: {
    attendanceVsSgpa: { attendanceBand: string; avgCgpa: number }[];
    placementVsCgpa: { cgpaTier: string; offerRate: number }[];
  };
  demographic: {
    scholarshipRoi: { group: string; avgCgpa: number; retentionRate: number }[];
  };
};

type Props = {
  data: AdvancedData;
  showMidTerm?: boolean;
};

const MIDTERM_COLORS = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };
const ENDTERM_COLORS: Record<string, string> = {
  AA: '#166534', AB: '#22c55e', BB: '#eab308', BC: '#38bdf8', 
  CC: '#facc15', CD: '#9ca3af', DD: '#f87171', F: '#991b1b'
};

export function AcademicInsightsDashboard({ data, showMidTerm = false }: Props) {
  const [filterYear, setFilterYear] = useState('All Years');
  const [filterDept, setFilterDept] = useState('All Departments');
  const years = [1, 2, 3, 4];

  // Safely extract properties with fallbacks in case the API payload is older/different
  const { summary, comparative, outliers, correlative, demographic } = data;

  const getEndTermData = (batch?: BatchData) => {
    if (!batch) return [];
    return Object.entries(batch.endTerm)
      .map(([grade, count]) => ({ name: `Grade ${grade}`, value: count, color: ENDTERM_COLORS[grade] || '#ccc' }))
      .filter(d => d.value > 0);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Global Filter Bar */}
      <Card className="bg-muted/40 border-none shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="w-4 h-4" /> Global Insight Filters
          </div>
          <div className="flex flex-wrap gap-4">
            <Select 
              value={filterYear} 
              onChange={(e) => setFilterYear(e.target.value)}
              className="h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="All Years">All Years</option>
              <option value="2026-2027">2026-2027</option>
              <option value="2025-2026">2025-2026</option>
            </Select>
            <Select 
              value={filterDept} 
              onChange={(e) => setFilterDept(e.target.value)}
              className="h-10 w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="All Departments">All Departments</option>
              {comparative?.departmentWise?.map(d => (
                <option key={d.department} value={d.department}>{d.department}</option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Widgets */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-green-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Trophy className="h-4 w-4 text-green-500" />
                <h3 className="text-sm font-medium text-muted-foreground">Excellence Rate</h3>
              </div>
              <div className="mt-4 text-3xl font-bold">{summary.excellenceRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">Students &gt; 9.0 CGPA</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-medium text-muted-foreground">Risk Rate</h3>
              </div>
              <div className="mt-4 text-3xl font-bold text-red-600">{summary.riskRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">Students with active backlogs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparative Analytics */}
      {comparative && (
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Department Comparative</CardTitle>
              <CardDescription>Average CGPA across branches</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparative.departmentWise} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} />
                  <YAxis dataKey="department" type="category" tick={{fontSize: 12}} width={100} />
                  <RechartsTooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="avgCgpa" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Avg CGPA" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cohort Progression</CardTitle>
              <CardDescription>Batch-on-Batch average CGPA tracking</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparative.cohortProgression} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="batch" />
                  <YAxis domain={[5, 10]} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="avgCgpa" stroke="#8b5cf6" strokeWidth={3} dot={{r: 6}} name="Avg CGPA" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Correlative Analytics */}
      {correlative && (
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance vs. Performance</CardTitle>
              <CardDescription>How attendance impacts SGPA/CGPA</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={correlative.attendanceVsSgpa} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="attendanceBand" />
                  <YAxis domain={[0, 10]} />
                  <RechartsTooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="avgCgpa" fill="#10b981" radius={[4, 4, 0, 0]} name="Avg CGPA" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Placements by Academic Tier</CardTitle>
              <CardDescription>Offer rate percentage across CGPA bands</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={correlative.placementVsCgpa} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="cgpaTier" />
                  <YAxis domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <RechartsTooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="offerRate" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Offer Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Outliers & Anomalies */}
      <div className="grid gap-8 lg:grid-cols-3">
        {outliers && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Bottleneck Subjects</CardTitle>
              <CardDescription>Courses with highest failure rates (&gt;20%)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-md">Course Code</th>
                      <th className="px-4 py-3">Course Name</th>
                      <th className="px-4 py-3 text-right rounded-tr-md">Failure Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outliers.bottlenecks.map((b, i) => (
                      <tr key={b.courseCode} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{b.courseCode}</td>
                        <td className="px-4 py-3 text-muted-foreground">{b.courseName || 'Unknown Course'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full font-semibold">
                            {b.failureRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {outliers.bottlenecks.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No critical bottleneck subjects found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {demographic && (
          <Card>
            <CardHeader>
              <CardTitle>Scholarship ROI</CardTitle>
              <CardDescription>Avg CGPA by Funding Type</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px] flex flex-col">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={demographic.scholarshipRoi} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} />
                  <YAxis dataKey="group" type="category" hide />
                  <RechartsTooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="avgCgpa" radius={[0, 4, 4, 0]} name="Avg CGPA">
                    {demographic.scholarshipRoi.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 1 ? '#94a3b8' : '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 mt-4 text-xs">
                {demographic.scholarshipRoi.map((g, i) => (
                  <div key={g.group} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: i === 0 ? '#10b981' : i === 1 ? '#94a3b8' : '#6366f1' }} />
                      <span>{g.group}</span>
                    </div>
                    <span className="font-semibold">{g.avgCgpa}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Existing End-Term Grade Pies (Batch wise) */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {years.map((year) => {
          const batch = data.years?.find((y) => y.year === year);
          const endTermData = getEndTermData(batch);
          return (
            <Card key={`grade-year-${year}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Year {year} Final Grades</CardTitle>
              </CardHeader>
              <CardContent>
                {endTermData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={endTermData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                          {endTermData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <RechartsTooltip />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No Grade Data</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
