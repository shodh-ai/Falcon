'use client';

import { useEffect, useState, useMemo } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

type Row = {
  course_code: string;
  course_name: string;
  enrolled: number;
  passed: number;
  failed: number;
  pass_percent: number;
};

export default function HodResultAnalyticsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<Row[]>('/api/academics/hod/result-analytics');
        setRows(data);
        if (data.length > 0) {
          setSelectedCourseCode(data[0].course_code);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load result analytics');
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const selectedCourse = useMemo(() => {
    return rows.find((r) => r.course_code === selectedCourseCode) || null;
  }, [rows, selectedCourseCode]);

  const pieData = useMemo(() => {
    if (!selectedCourse) return [];
    const graded = selectedCourse.passed + selectedCourse.failed;
    if (graded === 0) return [];
    return [
      { name: 'Passed', value: selectedCourse.passed, color: '#10B981' },
      { name: 'Failed', value: selectedCourse.failed, color: '#EF4444' },
    ];
  }, [selectedCourse]);

  const totalGraded = selectedCourse ? selectedCourse.passed + selectedCourse.failed : 0;

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Result Analytics"
        description="Pass / fail breakdown across department subjects."
      />

      <div className="flex flex-col gap-6 w-full">
        {/* Sticky Analysis Chart at the top on mobile, static on desktop */}
        <div className="sticky top-16 md:relative md:top-0 z-40 bg-background shadow-sm md:shadow-none p-2 -mx-4 sm:-mx-6 md:p-0 md:mx-0">
          {selectedCourse ? (
            <Card className="border-gray-100 shadow-sm bg-white overflow-hidden w-full">
              <CardHeader className="bg-slate-50/50 border-b border-gray-100 pb-4">
                <CardTitle className="text-base font-bold text-sgvu-navy truncate">
                  {selectedCourse.course_code} Result Analysis
                </CardTitle>
                <CardDescription className="text-xs truncate">
                  {selectedCourse.course_name}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {totalGraded > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    {/* Pass Rate Metric */}
                    <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0">
                      <span className="text-4xl font-black text-emerald-600">{selectedCourse.pass_percent}%</span>
                      <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground mt-1">Pass Rate</span>
                      <p className="text-xs text-muted-foreground text-center mt-3 max-w-[200px]">
                        Based on {totalGraded} graded students out of {selectedCourse.enrolled} enrolled.
                      </p>
                    </div>

                    {/* Donut Chart */}
                    <div className="h-44 w-full relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload as typeof pieData[number];
                                const percent = ((data.value / totalGraded) * 100).toFixed(1);
                                return (
                                  <div className="bg-white p-2 border border-slate-100 rounded-xl shadow-lg text-xs space-y-1">
                                    <p className="font-bold text-sgvu-navy">{data.name}</p>
                                    <p className="text-muted-foreground">
                                      Students: <span className="font-semibold text-sgvu-navy">{data.value}</span> ({percent}%)
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Legends & Breakdown */}
                    <div className="flex flex-col justify-center space-y-3 px-4">
                      <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                          <span className="text-sm font-medium text-sgvu-navy">Passed Students</span>
                        </div>
                        <span className="font-bold text-sm text-emerald-600">{selectedCourse.passed}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                          <span className="text-sm font-medium text-sgvu-navy">Failed Students</span>
                        </div>
                        <span className="font-bold text-sm text-red-600">{selectedCourse.failed}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>Total Graded:</span>
                        <span>{totalGraded} / {selectedCourse.enrolled}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No graded students for this subject yet.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-100 shadow-sm bg-white p-6 text-center text-xs text-muted-foreground">
              Select a subject from the list to view result analytics.
            </Card>
          )}
        </div>

        {/* Data Table below the chart */}
        <div className="w-full">
          <HodDataTable
            loading={loading}
            rows={rows}
            rowKey={(r) => r.course_code}
            empty="No graded enrollments yet."
            onRowClick={(r) => setSelectedCourseCode(r.course_code)}
            mobileRender={(r) => {
              const isSelected = r.course_code === selectedCourseCode;
              return (
                <div
                  className={cn(
                    "rounded-xl border p-4 transition-all duration-200",
                    isSelected 
                      ? "border-sgvu-navy bg-sgvu-navy/5 shadow-sm ring-1 ring-sgvu-navy" 
                      : "border-gray-100 bg-white shadow-xs hover:border-gray-200"
                  )}
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{r.course_code}</p>
                      <h4 className="text-sm font-bold text-sgvu-navy mt-0.5 truncate">{r.course_name}</h4>
                    </div>
                    <span className="shrink-0 rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {r.pass_percent}% Pass
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-slate-100/70">
                    <div>
                      <span className="font-semibold text-sgvu-navy">{r.enrolled}</span> Enrolled
                    </div>
                    <div>
                      <span className="font-semibold text-emerald-600">{r.passed}</span> Passed
                    </div>
                    <div>
                      <span className="font-semibold text-red-600">{r.failed}</span> Failed
                    </div>
                  </div>
                </div>
              );
            }}
            columns={[
              {
                key: 'course',
                label: 'Course',
                render: (r) => {
                  const isSelected = r.course_code === selectedCourseCode;
                  return (
                    <div className={isSelected ? 'font-semibold text-sgvu-navy' : ''}>
                      <p className="font-semibold text-sm">{r.course_code}</p>
                      <p className="text-muted-foreground text-xs">{r.course_name}</p>
                    </div>
                  );
                },
              },
              { key: 'enrolled', label: 'Enrolled', className: 'w-20 tabular-nums', render: (r) => r.enrolled },
              { key: 'passed', label: 'Passed', className: 'w-20 tabular-nums font-semibold', render: (r) => r.passed },
              { key: 'failed', label: 'Failed', className: 'w-20 tabular-nums', render: (r) => r.failed },
              {
                key: 'pass',
                label: 'Pass %',
                className: 'w-20 tabular-nums font-bold text-emerald-600',
                render: (r) => `${r.pass_percent}%`,
              },
            ]}
          />
        </div>
      </div>
    </HodPageFrame>
  );
}
