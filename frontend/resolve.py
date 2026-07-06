import re

with open(r'd:\Falcon\frontend\src\components\hod\HodPagePrimitives.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Keep origin/main version of HodPagePrimitives.tsx
text = re.sub(r'<<<<<<< HEAD\n.*?\n=======\n(.*?)\n>>>>>>> origin/main', r'\1', text, flags=re.DOTALL)

with open(r'd:\Falcon\frontend\src\components\hod\HodPagePrimitives.tsx', 'w', encoding='utf-8') as f:
    f.write(text)


with open(r'd:\Falcon\frontend\src\app\(portals)\hod\academics\result-analytics\page.tsx', 'r', encoding='utf-8') as f:
    page = f.read()

# Manual merge for result-analytics
# 1. Imports: keep both
imports = """import { CourseEnrolledStudentsModal } from '@/components/hod/CourseEnrolledStudentsModal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';"""

page = re.sub(r'<<<<<<< HEAD\n.*?\n=======\n.*?\n>>>>>>> origin/main', imports, page, count=1, flags=re.DOTALL)

# 2. Row type: we don't have conflict markers there because main didn't touch it. 
# But wait, did main touch the state?
state_merge = """  const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);"""

page = re.sub(r'<<<<<<< HEAD\n.*?\n=======\n.*?\n>>>>>>> origin/main', state_merge, page, count=1, flags=re.DOTALL)


# 3. Layout merge
# We need to insert the button in the CardHeader and the modal below the card.
# The third conflict marker contains the entire table and chart layout from main, vs the table + modal from HEAD.

main_layout = """
      <div className="flex flex-col gap-6 w-full">
        {/* Sticky Analysis Chart at the top on mobile, static on desktop */}
        <div className="sticky top-16 md:relative md:top-0 z-40 bg-background shadow-sm md:shadow-none p-2 -mx-4 sm:-mx-6 md:p-0 md:mx-0">
          {selectedCourse ? (
            <Card className="border-gray-100 shadow-sm bg-white overflow-hidden w-full relative">
              <CardHeader className="bg-slate-50/50 border-b border-gray-100 pb-4 pr-32">
                <CardTitle className="text-base font-bold text-sgvu-navy truncate">
                  {selectedCourse.course_code} Result Analysis
                </CardTitle>
                <CardDescription className="text-xs truncate">
                  {selectedCourse.course_name}
                </CardDescription>
              </CardHeader>
              <div className="absolute top-4 right-4">
                <Button variant="outline" size="sm" onClick={() => setIsModalOpen(true)}>
                  View Students
                </Button>
              </div>
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
                                const data = payload[0].payload;
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
        
        <CourseEnrolledStudentsModal
          courseId={selectedCourse?.course_id ?? null}
          courseName={selectedCourse?.course_name ?? null}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
        />
      </div>
"""

page = re.sub(r'<<<<<<< HEAD\n.*?\n=======\n.*?\n>>>>>>> origin/main', main_layout, page, count=1, flags=re.DOTALL)

with open(r'd:\Falcon\frontend\src\app\(portals)\hod\academics\result-analytics\page.tsx', 'w', encoding='utf-8') as f:
    f.write(page)
