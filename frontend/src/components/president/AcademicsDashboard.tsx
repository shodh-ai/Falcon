'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, MessageSquare, Search, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  ACADEMICS_KPI,
  ACADEMICS_SCHOOLS,
  attendanceBarColor,
  isHealthyAttendance,
  type AcademicSchoolRow,
  type AcademicsKpi,
} from './academicsMockData';
import { DemoDataBanner } from './DemoDataBanner';

type ApiSchool = {
  department: string;
  pass_count: number;
  fail_count: number;
  average_attendance: number;
};

type ApiAcademics = { schools?: ApiSchool[]; active_students?: number };

function toPercentRow(row: ApiSchool): AcademicSchoolRow {
  const total = row.pass_count + row.fail_count;
  const pass_pct = total > 0 ? Math.round((row.pass_count / total) * 100) : 0;
  const fail_pct = total > 0 ? Math.round((row.fail_count / total) * 100) : 0;
  return {
    department: row.department,
    pass_pct,
    fail_pct,
    average_attendance: Math.round(Number(row.average_attendance) || 0),
  };
}

function deriveKpis(
  schools: AcademicSchoolRow[],
  options?: { activeStudents?: number; usingSmokeData?: boolean },
): AcademicsKpi {
  if (!schools.length) return ACADEMICS_KPI;

  const avgAttendance = Math.round(
    schools.reduce((s, r) => s + r.average_attendance, 0) / schools.length,
  );
  const passRate = Math.round(schools.reduce((s, r) => s + r.pass_pct, 0) / schools.length);
  const atRisk = schools.filter((r) => r.average_attendance < 75).length;
  const showTrends = options?.usingSmokeData !== false;

  return {
    avgAttendance: {
      value: avgAttendance,
      trend: showTrends ? ACADEMICS_KPI.avgAttendance.trend : 0,
    },
    passRate: {
      value: passRate,
      trend: showTrends ? ACADEMICS_KPI.passRate.trend : 0,
    },
    activeStudents:
      typeof options?.activeStudents === 'number' && options.activeStudents > 0
        ? options.activeStudents
        : ACADEMICS_KPI.activeStudents,
    atRiskDepartments: atRisk,
  };
}

function TrendLine({ trend }: { trend: number }) {
  const positive = trend >= 0;
  return (
    <p
      className={`flex items-center gap-1 text-sm font-medium ${positive ? 'text-emerald-700' : 'text-red-600'}`}
    >
      {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {positive ? '+' : ''}
      {trend}% vs last semester
    </p>
  );
}

export function AcademicsDashboard() {
  const api = useAuthedApi();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<AcademicSchoolRow[]>(ACADEMICS_SCHOOLS);
  const [usingSmokeData, setUsingSmokeData] = useState(true);
  const [liveActiveStudents, setLiveActiveStudents] = useState<number | undefined>();
  const [query, setQuery] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<ApiAcademics>('/api/president/academics');
        const apiRows = data?.schools ?? [];
        if (apiRows.length > 0) {
          setSchools(apiRows.map(toPercentRow));
          setLiveActiveStudents(
            typeof data.active_students === 'number' ? data.active_students : undefined,
          );
          setUsingSmokeData(false);
        } else {
          setSchools(ACADEMICS_SCHOOLS);
          setLiveActiveStudents(undefined);
          setUsingSmokeData(true);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load academic analytics');
        setSchools(ACADEMICS_SCHOOLS);
        setLiveActiveStudents(undefined);
        setUsingSmokeData(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  const kpis = useMemo(
    () =>
      deriveKpis(schools, {
        activeStudents: liveActiveStudents,
        usingSmokeData,
      }),
    [schools, liveActiveStudents, usingSmokeData],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return schools;
    const needle = query.toLowerCase();
    return schools.filter((row) => row.department.toLowerCase().includes(needle));
  }, [schools, query]);

  if (loading) return <FalconLoader label="Loading Academic Analytics…" />;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <div className="mx-auto max-w-7xl space-y-6">
        <LeadershipPageHeader
          eyebrow="Falcon Workspace"
          title="Academic Excellence"
          description="Pass/fail ratios and attendance trends by school and department."
        />

        {usingSmokeData && (
          <DemoDataBanner message="Showing demo academic analytics for portal testing (live school rows were empty)." />
        )}

      {/* Top KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>University Avg Attendance</CardDescription>
            <CardTitle className="text-3xl font-black">{kpis.avgAttendance.value}%</CardTitle>
          </CardHeader>
          {usingSmokeData ? (
            <CardContent className="pt-0">
              <TrendLine trend={kpis.avgAttendance.trend} />
            </CardContent>
          ) : null}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overall Pass Rate</CardDescription>
            <CardTitle className="text-3xl font-black">{kpis.passRate.value}%</CardTitle>
          </CardHeader>
          {usingSmokeData ? (
            <CardContent className="pt-0">
              <TrendLine trend={kpis.passRate.trend} />
            </CardContent>
          ) : null}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Active Students
            </CardDescription>
            <CardTitle className="text-3xl font-black">
              {kpis.activeStudents.toLocaleString('en-IN')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              At-Risk Departments
            </CardDescription>
            <CardTitle className="text-3xl font-black text-sgvu-navy">{kpis.atRiskDepartments}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">&lt; 75% Attendance</CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Visual Analytics</CardTitle>
          <CardDescription>Average Attendance Percentage by school / department</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {schools.map((item) => {
            const pct = Math.min(100, Math.max(0, item.average_attendance));
            const width = pct > 0 ? `${pct}%` : '0%';
            return (
              <div key={item.department} className="space-y-1">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{item.department}</span>
                  <span>{pct}%</span>
                </div>
                <div
                  className="h-3 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${item.department} average attendance: ${pct}%`}
                >
                  {pct > 0 ? (
                    <div
                      className={`h-full rounded-full transition-all ${attendanceBarColor(pct)}`}
                      style={{ width }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Data Table</CardTitle>
            <CardDescription>{filtered.length} records</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter academic departments"
              className="pl-9"
              placeholder="Filter table..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {/* aria-label instead of sr-only <caption>: absolutely-positioned captions escape
              the table in Chromium and stretch the document, creating blank scroll space. */}
          <table
            className="w-full min-w-[760px] text-left text-sm"
            aria-label="Academic performance and attendance by school or department"
          >
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-bold">School / Department</th>
                <th scope="col" className="w-24 px-4 py-3 text-right font-bold">Pass</th>
                <th scope="col" className="w-24 px-4 py-3 text-right font-bold">Fail</th>
                <th scope="col" className="w-36 px-4 py-3 text-right font-bold">Avg Attendance</th>
                <th scope="col" className="w-28 px-4 py-3 text-center font-bold">Status</th>
                <th scope="col" className="w-44 px-4 py-3 text-center font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.department} className="border-b last:border-0 hover:bg-slate-50/80">
                  <td className="px-4 py-3.5 text-left font-medium text-sgvu-navy">{row.department}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{row.pass_pct}%</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{row.fail_pct}%</td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums">{row.average_attendance}%</td>
                  <td className="px-4 py-3.5 text-center">
                    {isHealthyAttendance(row.average_attendance) ? (
                      <Badge variant="success">Healthy</Badge>
                    ) : (
                      <Badge className="border-transparent bg-red-100 text-red-800">Critical</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center align-middle">
                    <Button
                      size="sm"
                      className="h-9 w-36 cursor-pointer justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0B2447] px-3 font-semibold text-white transition-colors hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy focus-visible:ring-2 focus-visible:ring-sgvu-gold focus-visible:ring-offset-2"
                      onClick={() =>
                        router.push(
                          `/president/meetings?compose=schedule&department=${encodeURIComponent(row.department)}&query=${encodeURIComponent(row.department)}&role=HOD`,
                        )
                      }
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      Contact HOD
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No records found.</p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
