'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  Inbox,
  RefreshCw,
  Users,
} from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { FalconLoader } from '@/components/brand/FalconLoader';
import {
  HodActionButton,
  HodDataTable,
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TodayBirthdaysWidget } from '@/components/dashboard/TodayBirthdaysWidget';

type HealthMetrics = {
  total_faculty: number;
  faculty_present_today: number;
  faculty_on_leave_today: number;
  total_students: number;
  classes_scheduled_today: number;
  classes_cancelled_today: number;
  classes_rescheduled_today: number;
  average_attendance: number;
  attendance_trend_pct: number;
  attendance_trend_label: string;
  pending_leave_count: number;
  pending_gate_pass_count: number;
  pending_profile_corrections: number;
  pending_inbox_total: number;
};

type SyllabusRow = {
  course_code: string;
  course_name: string;
  faculty_name: string;
  coverage_percent: number;
  behind_schedule: boolean;
};

type InboxRow = {
  id: string;
  type: string;
  title: string;
  employee_name: string;
  date_label: string;
  detail: string;
};

type DeficitRow = {
  user_id: string;
  name: string;
  email: string;
  average_attendance: number;
  course_count: number;
};

type CommandCenterPayload = {
  health_metrics: HealthMetrics;
  syllabus_coverage: SyllabusRow[];
  pending_inbox: InboxRow[];
  attendance_deficits: DeficitRow[];
  schools?: Array<{ school_id: number; school_name: string; school_code: string | null }>;
  department_count?: number;
  hod_count?: number;
  pending_events_count?: number;
};

type DeptRow = {
  dept_id: number;
  dept_name: string;
  hod_name: string | null;
  hod_email: string | null;
  faculty_count: number;
  student_count: number;
  active_courses: number;
  syllabus_completion_pct: number;
  attendance_risk_count: number;
};

export function DeanCommandCenter() {
  const api = useAuthedApi();
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [center, depts] = await Promise.all([
          api.get<CommandCenterPayload>('/api/academics/dean/command-center'),
          api.get<DeptRow[]>('/api/academics/dean/departments').catch(() => []),
        ]);
        setData(center);
        setDepartments(depts);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load school command center');
        if (!silent) {
          setData(null);
          setDepartments([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const behindSyllabus = useMemo(
    () => (data?.syllabus_coverage ?? []).filter((r) => r.behind_schedule),
    [data],
  );

  if (loading) {
    return (
      <HodPageFrame>
        <FalconLoader label="Loading School Command Center…" className="min-h-[40vh]" />
      </HodPageFrame>
    );
  }

  if (!data) {
    return (
      <HodPageFrame>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="font-semibold text-sgvu-navy">School command center unavailable</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Ensure your Dean account is linked to a school in Admin, or that your department is assigned on your profile.
          </p>
          <Button className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </HodPageFrame>
    );
  }

  const m = data.health_metrics;
  const schoolLabel = data.schools?.length
    ? data.schools.map((s) => s.school_name).join(', ')
    : departments[0]?.dept_name ?? 'Your school';

  return (
    <HodPageFrame>
      <HodPageHeader
        title="School Command Center"
        description={schoolLabel}
        workspaceLabel="Dean Workspace"
        meta={
          <>
            <span>{data.department_count ?? departments.length} department(s)</span>
            <span>·</span>
            <span>{data.hod_count ?? 0} HOD(s) mapped</span>
            <span>·</span>
            <span>{m.pending_inbox_total} pending sign-offs</span>
          </>
        }
        actions={
          <>
            <Button
              size="default"
              variant="outline"
              className="h-9 gap-2 text-sm text-sgvu-navy"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
            <HodActionButton href="/dean/departments">All Departments</HodActionButton>
            <HodActionButton href="/dean/events">Event Approvals</HodActionButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <HrStatCard
          label="Total Faculty"
          value={m.total_faculty}
          sub={`${m.faculty_on_leave_today} on leave today`}
          icon={Users}
          accent="navy"
        />
        <HrStatCard
          label="Students"
          value={m.total_students}
          icon={GraduationCap}
          accent="gold"
        />
        <HrStatCard
          label="Classes Today"
          value={m.classes_scheduled_today}
          sub={`${m.classes_cancelled_today} cancelled`}
          icon={CalendarClock}
          accent="gold"
          alert={m.classes_cancelled_today > 0}
        />
        <HrStatCard
          label="School Attendance"
          value={`${m.average_attendance}%`}
          icon={GraduationCap}
          trend={m.attendance_trend_pct}
          trendLabel={m.attendance_trend_label}
          alert={m.average_attendance < 75}
        />
        <HrStatCard
          label="Pending Inbox"
          value={m.pending_inbox_total}
          sub={`${m.pending_leave_count} leaves`}
          icon={Inbox}
          accent="gold"
          alert={m.pending_inbox_total > 0}
        />
        <HrStatCard
          label="Syllabus Risk"
          value={behindSyllabus.length}
          sub={behindSyllabus.length ? 'Courses behind' : 'On track'}
          icon={ClipboardList}
          alert={behindSyllabus.length > 0}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { href: '/dean/departments', label: 'Departments' },
          { href: '/dean/academics/timetable', label: 'Timetable' },
          { href: '/dean/faculty/workload', label: 'Faculty Workload' },
          { href: '/dean/academics/syllabus-tracking', label: 'Syllabus' },
          { href: '/dean/academics/result-analytics', label: 'Results' },
          { href: '/dean/students/monitor', label: 'Student Monitor' },
          { href: '/dean/meetings', label: 'Meetings' },
          { href: '/dean/inbox?scope=dept', label: 'HR Inbox' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-sgvu-navy shadow-sm transition-colors hover:border-sgvu-gold/50 hover:bg-sgvu-gold/5"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <HodPanel title="Departments & HODs">
          {departments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No departments in your school scope yet. Link your Dean account to schools in the database.
            </p>
          ) : (
            <HodDataTable
              columns={[
                {
                  key: 'dept',
                  label: 'Department',
                  render: (r) => r.dept_name,
                },
                {
                  key: 'hod',
                  label: 'HOD',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.hod_name ?? '—'}</p>
                      {r.hod_email ? (
                        <p className="text-xs text-muted-foreground">{r.hod_email}</p>
                      ) : null}
                    </div>
                  ),
                },
                { key: 'fac', label: 'Faculty', render: (r) => String(r.faculty_count) },
                { key: 'stu', label: 'Students', render: (r) => String(r.student_count) },
                {
                  key: 'risk',
                  label: 'Risk',
                  render: (r) =>
                    r.attendance_risk_count > 0 ? (
                      <span className="text-amber-700">{r.attendance_risk_count} at risk</span>
                    ) : (
                      <span className="text-emerald-700">OK</span>
                    ),
                },
              ]}
              rows={departments}
              rowKey={(r) => String(r.dept_id)}
            />
          )}
        </HodPanel>

        <HodPanel title="Pending approvals">
          {data.pending_inbox.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No pending items.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.pending_inbox.slice(0, 6).map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-sgvu-navy">{row.title}</p>
                    <p className="text-muted-foreground">
                      {row.employee_name} · {row.date_label}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {row.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/dean/inbox?scope=dept" className="mt-3 inline-block text-sm font-semibold text-sgvu-navy hover:underline">
            Open full inbox →
          </Link>
        </HodPanel>
      </div>

      {data.attendance_deficits.length > 0 ? (
        <HodPanel title="Attendance red flags">
          <HodDataTable
            columns={[
              { key: 'name', label: 'Student', render: (r) => r.name },
              { key: 'att', label: 'Avg %', render: (r) => `${r.average_attendance}%` },
              { key: 'courses', label: 'Courses', render: (r) => String(r.course_count) },
            ]}
            rows={data.attendance_deficits.slice(0, 8)}
            rowKey={(r) => r.user_id}
          />
          <Link href="/dean/students/monitor" className="mt-3 inline-block text-sm font-semibold text-sgvu-navy hover:underline">
            View all students →
          </Link>
        </HodPanel>
      ) : null}

      <TodayBirthdaysWidget
        endpoint="/api/master-data/birthdays/faculty/department?scope=dean"
        title="Faculty Birthdays Today"
      />
    </HodPageFrame>
  );
}
