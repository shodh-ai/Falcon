'use client';

import { useCallback, useEffect, useState } from 'react';
import { PassFailChart } from '@/components/leadership/LeadershipCharts';
import { LeadershipLineChart, NAVY } from '@/components/leadership/LeadershipCharts';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveDrillDown,
  ExecutiveExportButton,
  ExecutiveFeatureGrid,
  EXECUTIVE_SPACING,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { AttendanceDrillDown } from '@/components/leadership/AttendanceDrillDown';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { getLeadershipHubRoutes } from '@/lib/leadership-hub-routes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SchoolRow = {
  school: string;
  pass_count: number;
  fail_count: number;
  avg_attendance: number;
  avg_cgpa: number;
  alert?: boolean;
};

export default function LeadershipAcademicsPage() {
  const api = useLeadershipApi();
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [semester, setSemester] = useState<string>('all');
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    void api
      .academics(semester === 'all' ? undefined : Number(semester))
      .then(setData)
      .catch(() => setData(null));
  }, [api, semester]);

  useEffect(() => {
    load();
  }, [load]);

  const schools = (data?.schools as SchoolRow[]) ?? [];
  const iqac = (data?.iqac_research as Record<string, number>) ?? {};
  const topPerformers = (data?.top_performers as SchoolRow[]) ?? [];
  const bottomPerformers = (data?.bottom_performers as SchoolRow[]) ?? [];
  const attendanceTrend = (data?.attendance_trend as Array<{ week: string; attendance_pct: number }>) ?? [];
  const dropout = (data?.dropout as Record<string, number>) ?? {};
  const lowAttendanceSchools = schools.filter((s) => s.alert || s.avg_attendance < 75);

  const avgAttendance =
    schools.length > 0
      ? Math.round(schools.reduce((s, r) => s + r.avg_attendance, 0) / schools.length)
      : 0;

  return (
    <div className={EXECUTIVE_SPACING.page}>
      <LeadershipPageHeader
        eyebrow="Academic Health & Student Success"
        title="Academics Intelligence"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <Select value={semester} onValueChange={setSemester}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Semesters</SelectItem>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    Semester {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExecutiveExportButton targetId="academics-dashboard" filename="academics-analytics" />
          </div>
        }
      />

      <ExecutiveFeatureGrid
        title={getLeadershipHubRoutes('academics').title}
        description={getLeadershipHubRoutes('academics').description}
        routes={getLeadershipHubRoutes('academics').routes}
      />

      <div id="academics-dashboard" className={EXECUTIVE_SPACING.section}>
        <ExecutiveDrillDown
          label="Campus Attendance"
          value={`${avgAttendance}%`}
          sub={`${lowAttendanceSchools.length} schools below 75% threshold`}
          status={avgAttendance >= 85 ? 'green' : avgAttendance >= 75 ? 'yellow' : 'red'}
          chart={
            <LeadershipLineChart
              data={attendanceTrend as Record<string, unknown>[]}
              xKey="week"
              lines={[{ key: 'attendance_pct', color: NAVY, name: 'Attendance %' }]}
            />
          }
          details={<AttendanceDrillDown />}
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <TrafficLightKpi
            label="NAAC Readiness"
            value={`${iqac.naac_readiness_score ?? '—'}%`}
            status={(iqac.naac_readiness_score ?? 0) >= 70 ? 'green' : 'yellow'}
          />
          <TrafficLightKpi
            label="Dropout Rate"
            value={`${dropout.attrition_rate_pct ?? 0}%`}
            status={(dropout.attrition_rate_pct ?? 0) <= 5 ? 'green' : (dropout.attrition_rate_pct ?? 0) <= 10 ? 'yellow' : 'red'}
          />
          <TrafficLightKpi label="Publications (Month)" value={String(iqac.scopus_publications_this_month ?? '—')} status="green" />
          <TrafficLightKpi label="Patents Filed" value={String(iqac.patents_filed ?? '—')} status="green" />
        </div>

        {lowAttendanceSchools.length > 0 ? (
          <LeadershipSectionCard title="Attendance Alerts" description="Departments below 75% mandated threshold">
            <ul className="space-y-2 text-sm">
              {lowAttendanceSchools.map((s) => (
                <li key={s.school} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  {s.school}: {s.avg_attendance}% attendance
                </li>
              ))}
            </ul>
          </LeadershipSectionCard>
        ) : null}

        <LeadershipSectionCard title="Pass / Fail by School">
          <PassFailChart data={schools.map((s) => ({ school: s.school, pass_count: s.pass_count, fail_count: s.fail_count }))} />
        </LeadershipSectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <LeadershipSectionCard title="Top Performers (Avg CGPA)">
            <div className="space-y-2">
              {topPerformers.map((s) => (
                <div key={s.school} className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                  <span className="text-sm font-medium">{s.school}</span>
                  <span className="font-mono font-semibold text-emerald-700">{s.avg_cgpa?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </LeadershipSectionCard>
          <LeadershipSectionCard title="Bottom Performers (Avg CGPA)">
            <div className="space-y-2">
              {bottomPerformers.map((s) => (
                <div key={s.school} className="flex justify-between rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
                  <span className="text-sm font-medium">{s.school}</span>
                  <span className="font-mono font-semibold text-red-700">{s.avg_cgpa?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </LeadershipSectionCard>
        </div>

        <LeadershipSectionCard title="Dropout / Attrition">
          <div className="grid gap-4 sm:grid-cols-3">
            <TrafficLightKpi label="Active Students" value={String(dropout.active_students ?? '—')} status="green" />
            <TrafficLightKpi label="Dropouts" value={String(dropout.dropouts ?? '—')} status="yellow" />
            <TrafficLightKpi label="Attrition Rate" value={`${dropout.attrition_rate_pct ?? 0}%`} status="yellow" />
          </div>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
