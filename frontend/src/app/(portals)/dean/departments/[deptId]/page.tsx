'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodActionButton,
  HodMetricChip,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type DeptRow = {
  dept_id: number;
  dept_name: string;
  hod_name: string | null;
  hod_email: string | null;
  faculty_count: number;
  student_count: number;
  active_courses: number;
  timetable_slots: number;
  syllabus_completion_pct: number;
  syllabus_behind_count: number;
  attendance_risk_count: number;
  result_risk_count: number;
};

export default function DeanDepartmentOverviewPage() {
  const api = useAuthedApi();
  const params = useParams<{ deptId: string }>();
  const deptId = Number(params.deptId);
  const validDeptId = Number.isFinite(deptId) ? deptId : NaN;
  const [row, setRow] = useState<DeptRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<DeptRow[]>('/api/academics/dean/departments');
        setRow(data.find((d) => d.dept_id === validDeptId) ?? null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load department');
        setRow(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [api, validDeptId]);

  const riskLabel = useMemo(() => {
    if (!row) return '—';
    if (row.attendance_risk_count > 0 || row.syllabus_behind_count > 0) return 'At Risk';
    return 'Healthy';
  }, [row]);

  if (loading) {
    return (
      <HodPageFrame>
        <p className="py-12 text-center text-sm text-muted-foreground">Loading department overview…</p>
      </HodPageFrame>
    );
  }

  if (!row) {
    return (
      <HodPageFrame>
        <p className="py-12 text-center text-sm text-muted-foreground">Department not found in your school scope.</p>
        <div className="text-center">
          <HodActionButton href="/dean/departments" variant="outline">
            Back to Departments
          </HodActionButton>
        </div>
      </HodPageFrame>
    );
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title={row.dept_name}
        description="Department overview within your school."
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <HodMetricChip label="Faculty" value={row.faculty_count} />
            <HodMetricChip label="Students" value={row.student_count} />
            <HodMetricChip label="Risk" value={riskLabel} emphasis={riskLabel === 'At Risk'} />
          </>
        }
        actions={
          <>
            <HodActionButton href="/dean/departments" variant="outline">
              All Departments
            </HodActionButton>
            <HodActionButton href="/dean/dashboard">Command Center</HodActionButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <HodPanel title="Leadership">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">HOD</dt>
              <dd className="font-semibold text-sgvu-navy">{row.hod_name ?? 'Not assigned'}</dd>
              {row.hod_email ? <dd className="text-xs text-muted-foreground">{row.hod_email}</dd> : null}
            </div>
            <div>
              <dt className="text-muted-foreground">Academic Risk</dt>
              <dd className="font-semibold text-sgvu-navy">
                {row.attendance_risk_count} attendance · {row.result_risk_count} results
              </dd>
            </div>
          </dl>
        </HodPanel>

        <HodPanel title="Academics">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Active Courses</dt>
              <dd className="font-semibold text-sgvu-navy">{row.active_courses}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Weekly Timetable Slots</dt>
              <dd className="font-semibold text-sgvu-navy">{row.timetable_slots}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Syllabus Coverage</dt>
              <dd className="font-semibold text-sgvu-navy">
                {row.syllabus_completion_pct.toFixed(1)}%
                {row.syllabus_behind_count > 0 ? (
                  <span className="ml-2 text-xs text-red-600">({row.syllabus_behind_count} behind)</span>
                ) : null}
              </dd>
            </div>
          </dl>
        </HodPanel>
      </div>

      <HodPanel title="Quick Links">
        <div className="flex flex-wrap gap-2">
          <Link href={`/dean/academics/timetable?dept=${row.dept_id}`} className="rounded-lg border px-3 py-2 text-sm font-medium text-sgvu-navy hover:bg-sgvu-gold/5">
            Timetable
          </Link>
          <Link href="/dean/faculty/workload" className="rounded-lg border px-3 py-2 text-sm font-medium text-sgvu-navy hover:bg-sgvu-gold/5">
            Faculty Workload
          </Link>
          <Link href="/dean/academics/syllabus-tracking" className="rounded-lg border px-3 py-2 text-sm font-medium text-sgvu-navy hover:bg-sgvu-gold/5">
            Syllabus Tracking
          </Link>
          <Link href="/dean/students/monitor" className="rounded-lg border px-3 py-2 text-sm font-medium text-sgvu-navy hover:bg-sgvu-gold/5">
            Student Monitor
          </Link>
        </div>
      </HodPanel>
    </HodPageFrame>
  );
}
