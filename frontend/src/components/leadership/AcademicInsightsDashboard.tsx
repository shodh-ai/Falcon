'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Trophy, TrendingDown, TrendingUp, GraduationCap } from 'lucide-react';

/** Map study-year index (1–4) to an academic-year label like "2025-2026". */
function studyYearToAcademicLabel(studyYear: number, referenceDate = new Date()): string {
  const month = referenceDate.getMonth(); // 0-indexed; AY starts in July
  const currentAyStart = month >= 6 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
  const start = currentAyStart - (Math.max(1, studyYear) - 1);
  return `${start}-${start + 1}`;
}

function formatYearFilterLabel(filterYear: string): string {
  if (filterYear === 'all') return 'All academic years';
  const yearNum = Number(filterYear);
  if (!Number.isFinite(yearNum)) return filterYear;
  return studyYearToAcademicLabel(yearNum);
}

export type BatchData = {
  year: number;
  midTerm: { red: number; yellow: number; green: number };
  endTerm: {
    AA: number;
    AB: number;
    BB: number;
    BC: number;
    CC: number;
    CD: number;
    DD: number;
    F: number;
  };
};

export type AdvancedData = {
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
  AA: '#166534',
  AB: '#22c55e',
  BB: '#eab308',
  BC: '#38bdf8',
  CC: '#facc15',
  CD: '#9ca3af',
  DD: '#f87171',
  F: '#991b1b',
};

// Friendly display names for the two-letter grade codes.
const ENDTERM_LABELS: Record<string, string> = {
  AA: 'Grade A+',
  AB: 'Grade A',
  BB: 'Grade B+',
  BC: 'Grade B',
  CC: 'Grade C+',
  CD: 'Grade C',
  DD: 'Grade D',
  F: 'Grade F',
};

// Grade codes hidden from the grade distribution charts.
const HIDDEN_ENDTERM_GRADES = new Set(['BB', 'CC']);

const PIE_LEGEND_STYLE = {
  paddingTop: '12px',
  lineHeight: '20px',
};

function renderPieLegendLabel(value: string) {
  return <span className="inline-block text-center text-sm font-semibold text-sgvu-navy">{value}</span>;
}

function getEndTermData(batch?: BatchData) {
  if (!batch?.endTerm) return [];
  return Object.entries(batch.endTerm)
    .filter(([grade]) => !HIDDEN_ENDTERM_GRADES.has(grade))
    .map(([grade, count]) => ({
      name: ENDTERM_LABELS[grade] ?? `Grade ${grade}`,
      value: Number(count) || 0,
      color: ENDTERM_COLORS[grade] || '#ccc',
    }))
    .filter((d) => d.value > 0);
}

function getMidTermData(batch?: BatchData) {
  if (!batch?.midTerm) return [];
  return [
    { name: 'At Risk', value: batch.midTerm.red, color: MIDTERM_COLORS.red },
    { name: 'Watch', value: batch.midTerm.yellow, color: MIDTERM_COLORS.yellow },
    { name: 'On Track', value: batch.midTerm.green, color: MIDTERM_COLORS.green },
  ].filter((d) => d.value > 0);
}

function aggregateYears(years: BatchData[]): BatchData | undefined {
  if (!years.length) return undefined;
  const endTerm = { AA: 0, AB: 0, BB: 0, BC: 0, CC: 0, CD: 0, DD: 0, F: 0 };
  const midTerm = { red: 0, yellow: 0, green: 0 };
  for (const y of years) {
    for (const key of Object.keys(endTerm) as (keyof typeof endTerm)[]) {
      endTerm[key] += Number(y.endTerm?.[key] ?? 0);
    }
    midTerm.red += Number(y.midTerm?.red ?? 0);
    midTerm.yellow += Number(y.midTerm?.yellow ?? 0);
    midTerm.green += Number(y.midTerm?.green ?? 0);
  }
  return { year: 0, midTerm, endTerm };
}

export function AcademicInsightsDashboard({ data, showMidTerm = false }: Props) {
  const [filterYear, setFilterYear] = useState('all');
  const [filterDept, setFilterDept] = useState('all');

  const summary = data?.summary;
  const comparative = data?.comparative;
  const outliers = data?.outliers;
  const correlative = data?.correlative;
  const demographic = data?.demographic;
  const yearRows = useMemo(() => data?.years ?? [], [data?.years]);

  const availableYears = useMemo(
    () =>
      Array.from(new Set(yearRows.map((y) => y.year).filter((y) => Number.isFinite(y))))
        // Newest academic year first (matches executive year pickers).
        .sort((a, b) => a - b)
        .reverse(),
    [yearRows],
  );

  const departments = useMemo(
    () => comparative?.departmentWise?.map((d) => d.department) ?? [],
    [comparative],
  );

  const filteredYears = useMemo(() => {
    if (filterYear === 'all') return yearRows;
    const yearNum = Number(filterYear);
    return yearRows.filter((y) => y.year === yearNum);
  }, [yearRows, filterYear]);

  const filteredDepartments = useMemo(() => {
    const rows = comparative?.departmentWise ?? [];
    if (filterDept === 'all') return rows;
    return rows.filter((d) => d.department === filterDept);
  }, [comparative, filterDept]);

  const selectedDept = filterDept !== 'all' ? filteredDepartments[0] : null;

  const displaySummary = summary
    ? {
        excellenceRate: summary.excellenceRate,
        riskRate: summary.riskRate,
      }
    : null;

  const yearFilterLabel = formatYearFilterLabel(filterYear);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Card className="border-none bg-white shadow-sm">
        <CardContent className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Global Insight Filters
          </div>
          <div className="flex flex-wrap gap-4">
            <Select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="h-10 w-[200px]"
              aria-label="Filter by academic year"
            >
              <option value="all">All Years</option>
              {availableYears.map((year) => (
                <option key={year} value={String(year)}>
                  {studyYearToAcademicLabel(year)}
                </option>
              ))}
            </Select>
            <Select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="h-10 w-[240px]"
              aria-label="Filter by department"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {displaySummary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-green-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Trophy className="h-4 w-4 text-green-500" />
                <h3 className="text-sm font-medium text-muted-foreground">
                  {selectedDept ? 'Dept Avg CGPA' : 'Excellence Rate'}
                </h3>
              </div>
              <div className="mt-4 text-3xl font-bold">
                {selectedDept ? selectedDept.avgCgpa.toFixed(2) : `${displaySummary.excellenceRate}%`}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedDept ? selectedDept.department : 'Students > 9.0 CGPA'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-medium text-muted-foreground">
                  {selectedDept ? 'Pass Rate' : 'Risk Rate'}
                </h3>
              </div>
              <div className="mt-4 text-3xl font-bold text-sgvu-navy">
                {selectedDept ? `${selectedDept.passRate}%` : `${displaySummary.riskRate}%`}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedDept ? 'Students cleared without backlog' : 'Students with active backlogs'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-sgvu-navy shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <GraduationCap className="h-4 w-4 text-sgvu-navy" />
                <h3 className="text-sm font-medium text-muted-foreground">Years in View</h3>
              </div>
              <div className="mt-4 text-3xl font-bold">{filteredYears.length || availableYears.length}</div>
              <p className="mt-1 text-xs text-muted-foreground">{yearFilterLabel}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-medium text-muted-foreground">Departments</h3>
              </div>
              <div className="mt-4 text-3xl font-bold">{filteredDepartments.length}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {filterDept === 'all' ? 'Across all schools' : 'Filtered school'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {comparative && (
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Department Comparative</CardTitle>
              <CardDescription>
                {filterDept === 'all'
                  ? 'Average CGPA across branches'
                  : `Focused view · ${filterDept}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {filteredDepartments.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No department data for this filter.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredDepartments}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 10]} />
                    <YAxis
                      dataKey="department"
                      type="category"
                      width={180}
                      tick={{ fontSize: 12, fill: '#475569' }}
                      tickFormatter={(value: string) =>
                        value.length > 22 ? `${value.substring(0, 22)}...` : value
                      }
                    />
                    <RechartsTooltip cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="avgCgpa" fill="#1e3a5f" radius={[0, 4, 4, 0]} name="Avg CGPA" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cohort Progression</CardTitle>
              <CardDescription>Batch-on-batch average CGPA tracking</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {(comparative.cohortProgression?.length ?? 0) === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No cohort progression data.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={comparative.cohortProgression}
                    margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="batch" />
                    <YAxis domain={[5, 10]} />
                    <RechartsTooltip />
                    <Line
                      type="monotone"
                      dataKey="avgCgpa"
                      stroke="#1e3a5f"
                      strokeWidth={3}
                      dot={{ r: 6 }}
                      name="Avg CGPA"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {correlative && (
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance vs. Performance</CardTitle>
              <CardDescription>How attendance impacts SGPA/CGPA</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={correlative.attendanceVsSgpa ?? []}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="attendanceBand" />
                  <YAxis domain={[0, 10]} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} />
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
                <BarChart
                  data={correlative.placementVsCgpa ?? []}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="cgpaTier" />
                  <YAxis domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="offerRate" fill="#c9a227" radius={[4, 4, 0, 0]} name="Offer Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {outliers && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Bottleneck Subjects</CardTitle>
              <CardDescription>Courses with highest failure rates (&gt;20%)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {/* aria-label instead of sr-only <caption>: absolutely-positioned captions escape
                    the table in Chromium and stretch the document, creating blank scroll space. */}
                <table
                  className="w-full text-left text-sm"
                  aria-label="Courses with the highest failure rates"
                >
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th scope="col" className="rounded-tl-md px-4 py-3">Course Code</th>
                      <th scope="col" className="px-4 py-3">Course Name</th>
                      <th scope="col" className="rounded-tr-md px-4 py-3 text-right">Failure Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(outliers.bottlenecks ?? []).map((b) => (
                      <tr key={b.courseCode} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{b.courseCode}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {b.courseName || 'Unknown Course'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                            {Number(b.failureRate).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(outliers.bottlenecks?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                          No critical bottleneck subjects found.
                        </td>
                      </tr>
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
            <CardContent className="flex h-[250px] flex-col">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={demographic.scholarshipRoi ?? []}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} />
                  <YAxis dataKey="group" type="category" hide />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="avgCgpa" radius={[0, 4, 4, 0]} name="Avg CGPA">
                    {(demographic.scholarshipRoi ?? []).map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? '#10b981' : index === 1 ? '#94a3b8' : '#1e3a5f'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-col gap-2 text-xs">
                {(demographic.scholarshipRoi ?? []).map((g, i) => (
                  <div key={g.group} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: i === 0 ? '#10b981' : i === 1 ? '#94a3b8' : '#1e3a5f',
                        }}
                      />
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

      {showMidTerm && (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {(filterYear === 'all' ? availableYears : [Number(filterYear)]).map((year) => {
            const batch = filteredYears.find((y) => y.year === year) ?? yearRows.find((y) => y.year === year);
            const midTermData = getMidTermData(batch);
            return (
              <Card key={`mid-year-${year}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{studyYearToAcademicLabel(year)} Mid-Term</CardTitle>
                </CardHeader>
                <CardContent>
                  {midTermData.length > 0 ? (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer>
                          <Pie
                            data={midTermData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={60}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {midTermData.map((entry, index) => (
                              <Cell key={`mid-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                          <Legend
                            layout="horizontal"
                            verticalAlign="bottom"
                            align="center"
                            formatter={renderPieLegendLabel}
                            wrapperStyle={PIE_LEGEND_STYLE}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                      No Mid-Term Data
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {(filterYear === 'all' ? availableYears : [Number(filterYear)]).map((year) => {
          const batch =
            filteredYears.find((y) => y.year === year) ?? yearRows.find((y) => y.year === year);
          const endTermData = getEndTermData(batch);
          return (
            <Card key={`grade-year-${year}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{studyYearToAcademicLabel(year)} Final Grades</CardTitle>
              </CardHeader>
              <CardContent>
                {endTermData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart accessibilityLayer>
                        <Pie
                          data={endTermData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {endTermData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend
                          layout="horizontal"
                          verticalAlign="bottom"
                          align="center"
                          formatter={renderPieLegendLabel}
                          wrapperStyle={PIE_LEGEND_STYLE}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                    No Grade Data
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filterYear !== 'all' && filteredYears.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-4">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No grade distribution for {formatYearFilterLabel(filterYear)}.
            </CardContent>
          </Card>
        )}
      </div>

      {filterYear === 'all' && yearRows.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Combined Final Grade</CardTitle>
            <CardDescription>Aggregated end-term grades across all academic years</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {(() => {
              const combined = getEndTermData(aggregateYears(yearRows));
              if (!combined.length) {
                return (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No combined grade data.
                  </div>
                );
              }
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={combined}
                    margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <RechartsTooltip />
                    <Bar dataKey="value" name="Students" radius={[4, 4, 0, 0]}>
                      {combined.map((entry, index) => (
                        <Cell key={`combo-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
