'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  Download,
  Filter,
  GraduationCap,
  Loader2,
  RotateCcw,
  School,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type NamedCount = { label: string; count: number };

type CampusReportsPayload = {
  generated_at?: string;
  campus_ids?: number[];
  filter_options?: {
    departments?: Array<{ dept_id: number; dept_name: string }>;
    programs?: Array<{
      program_id: number;
      program_name: string;
      program_code?: string | null;
      dept_id?: number | null;
    }>;
    academic_years?: string[];
  };
  overview?: {
    total_students?: number;
    new_admissions?: number;
    total_enrolled?: number;
    faculty_staff?: number;
    departments?: number;
    programs?: number;
  };
  students?: {
    total?: number;
    active?: number;
    new_students?: number;
    by_department?: Array<{
      department: string;
      students: number;
      active: number;
      inactive: number;
    }>;
    by_program?: Array<{ program: string; students: number }>;
  };
  admissions?: {
    total?: number;
    pending?: number;
    verified?: number;
    approved?: number;
    rejected?: number;
    withdrawn?: number;
    pipeline?: Array<{ stage: string; count: number }>;
    by_program?: Array<{ program: string; count: number }>;
    by_department?: Array<{ department: string; count: number }>;
  };
  enrollment?: {
    total?: number;
    new_enrollments?: number;
    by_department?: Array<{ department: string; enrolled: number }>;
    by_program?: Array<{ program: string; enrolled: number }>;
    by_academic_year?: Array<{ academic_year: string; enrolled: number }>;
    trend?: Array<{ month: string; enrolled: number }>;
  };
  departments?: {
    total?: number;
    active?: number;
    rows?: Array<{
      dept_name: string;
      school_name?: string | null;
      hod_name?: string | null;
      students?: number;
      faculty?: number;
      programs?: number;
      status?: string;
    }>;
  };
  faculty?: {
    total?: number;
    active?: number;
    staff?: number;
    by_department?: Array<{ department: string; count: number }>;
    rows?: Array<{
      name: string;
      department?: string | null;
      designation?: string | null;
      status?: string;
    }>;
  };
  campus?: {
    campus_name?: string | null;
    campus_code?: string | null;
    address?: string | null;
    university_name?: string | null;
    status?: string;
    schools?: number;
    departments?: number;
    programs?: number;
    students?: number;
    faculty_staff?: number;
    classrooms?: number;
    facilities?: number;
  };
  users?: {
    total?: number;
    active?: number;
    inactive?: number;
    by_role?: Array<{
      role_name: string;
      total: number;
      active: number;
      inactive: number;
    }>;
    by_department?: Array<{ department: string; total: number; active: number }>;
  };
};

type FilterState = {
  from: string;
  to: string;
  academic_year: string;
  dept_id: string;
  program_id: string;
};

const EMPTY_FILTERS: FilterState = {
  from: '',
  to: '',
  academic_year: '',
  dept_id: '',
  program_id: '',
};

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'students', label: 'Students' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'departments', label: 'Departments' },
  { id: 'faculty', label: 'Faculty' },
  { id: 'campus', label: 'Campus' },
  { id: 'users', label: 'Users' },
] as const;

function n(value?: number | null) {
  return Number(value ?? 0).toLocaleString('en-IN');
}

function formatUpdatedAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-white px-4 py-3.5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums tracking-tight text-sgvu-navy">
        {typeof value === 'number' ? n(value) : value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReportSection({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-sgvu-navy">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-4 md:p-5">{children}</CardContent>
      </Card>
    </section>
  );
}

function EmptyNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-sgvu-navy/15 bg-slate-50/80 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  emptyMessage: string;
}) {
  if (!rows.length) return <EmptyNotice message={emptyMessage} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-sgvu-navy/10">
      <table className="w-full min-w-[320px] text-left text-sm">
        <thead className="bg-slate-50/90">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={cn(
                'border-t border-sgvu-navy/5',
                index % 2 === 1 && 'bg-slate-50/40',
              )}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'px-3 py-2.5 text-sgvu-navy/90',
                    cellIndex === 0 && 'font-medium text-sgvu-navy',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ items, emptyMessage }: { items: NamedCount[]; emptyMessage: string }) {
  if (!items.length) return <EmptyNotice message={emptyMessage} />;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.label}-${item.count}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-sgvu-navy">{item.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {n(item.count)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sgvu-navy"
              style={{
                width: `${Math.max((item.count / max) * 100, item.count > 0 ? 3 : 0)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Pipeline({ stages }: { stages: Array<{ stage: string; count: number }> }) {
  const hasData = stages.some((s) => Number(s.count) > 0);
  if (!hasData) {
    return <EmptyNotice message="No admission applications found for this campus yet." />;
  }
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      {stages.map((stage, index) => (
        <div key={stage.stage} className="flex flex-1 items-center gap-2">
          <div className="w-full rounded-xl border border-sgvu-navy/10 bg-slate-50/70 px-3 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground">{stage.stage}</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-sgvu-navy">
              {n(stage.count)}
            </p>
          </div>
          {index < stages.length - 1 ? (
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-sgvu-navy/35 md:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-sgvu-navy">{title}</h3>
      {children}
    </div>
  );
}

export function CampusAdminCampusReportsPage() {
  const api = useAuthedApi();
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [data, setData] = useState<CampusReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    if (applied.academic_year) params.set('academic_year', applied.academic_year);
    if (applied.dept_id) params.set('dept_id', applied.dept_id);
    if (applied.program_id) params.set('program_id', applied.program_id);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [applied]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.get<CampusReportsPayload>(
        `/api/campus-admin/reports${queryString}`,
      );
      setData(payload ?? null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load campus reports.');
    } finally {
      setLoading(false);
    }
  }, [api, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = data?.filter_options?.departments ?? [];
  const programs = (data?.filter_options?.programs ?? []).filter((p) =>
    !draft.dept_id ? true : String(p.dept_id ?? '') === draft.dept_id,
  );
  const academicYears = data?.filter_options?.academic_years ?? [];

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (applied.from || applied.to) {
      labels.push(
        `Dates: ${applied.from || '…'} → ${applied.to || '…'}`,
      );
    }
    if (applied.academic_year) labels.push(`Year: ${applied.academic_year}`);
    if (applied.dept_id) {
      const dept = departments.find((d) => String(d.dept_id) === applied.dept_id);
      labels.push(`Dept: ${dept?.dept_name ?? applied.dept_id}`);
    }
    if (applied.program_id) {
      const program = (data?.filter_options?.programs ?? []).find(
        (p) => String(p.program_id) === applied.program_id,
      );
      labels.push(`Program: ${program?.program_name ?? applied.program_id}`);
    }
    return labels;
  }, [applied, departments, data?.filter_options?.programs]);

  function applyFilters() {
    setApplied({ ...draft });
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  }

  function exportReport() {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      ['Campus Reports Export'],
      ['Generated at', data.generated_at ?? ''],
      ['Campus', data.campus?.campus_name ?? ''],
      ['From', applied.from || ''],
      ['To', applied.to || ''],
      ['Academic Year', applied.academic_year || ''],
      ['Department ID', applied.dept_id || ''],
      ['Program ID', applied.program_id || ''],
      [],
      ['Overview'],
      ['Total Students', data.overview?.total_students ?? 0],
      ['New Admissions', data.overview?.new_admissions ?? 0],
      ['Total Enrolled', data.overview?.total_enrolled ?? 0],
      ['Faculty & Staff', data.overview?.faculty_staff ?? 0],
      ['Departments', data.overview?.departments ?? 0],
      ['Programs', data.overview?.programs ?? 0],
      [],
      ['Students by Department'],
      ['Department', 'Students', 'Active', 'Inactive'],
      ...(data.students?.by_department ?? []).map((r) => [
        r.department,
        r.students,
        r.active,
        r.inactive,
      ]),
      [],
      ['Admission Pipeline'],
      ['Stage', 'Count'],
      ...(data.admissions?.pipeline ?? []).map((r) => [r.stage, r.count]),
      [],
      ['Enrollment by Program'],
      ['Program', 'Enrolled'],
      ...(data.enrollment?.by_program ?? []).map((r) => [r.program, r.enrolled]),
      [],
      ['Departments'],
      ['Department', 'School', 'HOD', 'Students', 'Faculty', 'Programs', 'Status'],
      ...(data.departments?.rows ?? []).map((r) => [
        r.dept_name,
        r.school_name ?? '',
        r.hod_name ?? '',
        r.students ?? 0,
        r.faculty ?? 0,
        r.programs ?? 0,
        r.status ?? '',
      ]),
      [],
      ['Faculty'],
      ['Name', 'Department', 'Designation', 'Status'],
      ...(data.faculty?.rows ?? []).map((r) => [
        r.name,
        r.department ?? '',
        r.designation ?? '',
        r.status ?? '',
      ]),
      [],
      ['Users by Role'],
      ['Role', 'Total', 'Active', 'Inactive'],
      ...(data.users?.by_role ?? []).map((r) => [r.role_name, r.total, r.active, r.inactive]),
    ];
    downloadCsv(`campus-reports-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const studentBars: NamedCount[] = (data?.students?.by_department ?? []).map((r) => ({
    label: r.department,
    count: Number(r.students ?? 0),
  }));
  const admissionBars: NamedCount[] = (data?.admissions?.by_program ?? []).map((r) => ({
    label: r.program,
    count: Number(r.count ?? 0),
  }));
  const enrollmentBars: NamedCount[] = (data?.enrollment?.trend ?? []).map((r) => ({
    label: r.month,
    count: Number(r.enrolled ?? 0),
  }));
  const facultyBars: NamedCount[] = (data?.faculty?.by_department ?? []).map((r) => ({
    label: r.department,
    count: Number(r.count ?? 0),
  }));
  const updatedAt = formatUpdatedAt(data?.generated_at);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Page header */}
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy md:text-[1.75rem]">
              Campus Reports
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              A clear view of students, admissions, enrollment, departments, faculty, and campus
              performance for your assigned campus.
            </p>
            {data?.campus?.campus_name ? (
              <p className="mt-2 text-sm font-medium text-sgvu-navy">
                {data.campus.campus_name}
                {data.campus.campus_code ? (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {data.campus.campus_code}
                  </span>
                ) : null}
              </p>
            ) : null}
            {updatedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">Updated {updatedAt}</p>
            ) : null}
          </div>
          <Button
            type="button"
            className="h-10 shrink-0 bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
            onClick={exportReport}
            disabled={!data || loading}
          >
            <Download className="mr-2 h-4 w-4" />
            Export report
          </Button>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <p className="text-xs text-muted-foreground">
              Choose options, then click Apply. Reset clears all filters.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Date from
              <Input
                type="date"
                className="h-10"
                value={draft.from}
                onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Date to
              <Input
                type="date"
                className="h-10"
                value={draft.to}
                onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Academic year
              <Select
                className="h-10"
                value={draft.academic_year}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, academic_year: String(e.target.value) }))
                }
              >
                <option value="">All years</option>
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Department
              <Select
                className="h-10"
                value={draft.dept_id}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    dept_id: String(e.target.value),
                    program_id: '',
                  }))
                }
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.dept_id} value={String(d.dept_id)}>
                    {d.dept_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Program
              <Select
                className="h-10"
                value={draft.program_id}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, program_id: String(e.target.value) }))
                }
              >
                <option value="">All programs</option>
                {programs.map((p) => (
                  <option key={p.program_id} value={String(p.program_id)}>
                    {p.program_name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-sgvu-navy/5 pt-4">
            <Button
              type="button"
              className="h-9 bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              onClick={applyFilters}
              disabled={loading}
            >
              Apply filters
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={resetFilters}
              disabled={loading}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset
            </Button>
            {activeFilterLabels.length ? (
              <div className="ml-auto flex flex-wrap gap-1.5">
                {activeFilterLabels.map((label) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className="border-sgvu-navy/15 bg-sgvu-navy/[0.03] font-normal text-sgvu-navy"
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="ml-auto text-xs text-muted-foreground">Showing full campus data</p>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading campus reports…
        </div>
      ) : error && !data ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button className="mt-4 h-9" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {error ? (
            <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="text-sm text-amber-950">{error}</p>
                <Button type="button" variant="outline" className="h-8" onClick={() => void load()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Jump navigation */}
          <nav
            aria-label="Report sections"
            className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-xl border border-sgvu-navy/10 bg-white/95 px-2 py-2 shadow-sm backdrop-blur"
          >
            <div className="flex min-w-max gap-1">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-sgvu-navy/70 transition-colors hover:bg-sgvu-navy/5 hover:text-sgvu-navy"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </nav>

          {/* Overview */}
          <section id="overview" className="scroll-mt-24 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-sgvu-navy">At a glance</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Key numbers for your campus. Use the sections below for detail.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Students" value={data?.overview?.total_students ?? 0} />
              <Kpi label="Admissions" value={data?.overview?.new_admissions ?? 0} hint="Applications" />
              <Kpi label="Enrolled" value={data?.overview?.total_enrolled ?? 0} />
              <Kpi label="Faculty & staff" value={data?.overview?.faculty_staff ?? 0} />
              <Kpi label="Departments" value={data?.overview?.departments ?? 0} />
              <Kpi label="Programs" value={data?.overview?.programs ?? 0} />
            </div>
          </section>

          <ReportSection
            id="students"
            title="Students"
            description="How many students are on this campus, and how they are spread across departments."
            icon={<GraduationCap className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Total students" value={data?.students?.total ?? 0} />
              <Kpi label="Active" value={data?.students?.active ?? 0} />
              <Kpi label="New (last 90 days)" value={data?.students?.new_students ?? 0} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="By department">
                <BarList
                  items={studentBars.slice(0, 8)}
                  emptyMessage="No student data available for this campus."
                />
              </Panel>
              <Panel title="Department summary">
                <DataTable
                  headers={['Department', 'Students', 'Active', 'Inactive']}
                  emptyMessage="No student data available for this campus."
                  rows={(data?.students?.by_department ?? []).map((row) => [
                    row.department,
                    n(row.students),
                    n(row.active),
                    n(row.inactive),
                  ])}
                />
              </Panel>
            </div>
            {(data?.students?.by_program?.length ?? 0) > 0 ? (
              <p className="text-xs text-muted-foreground">
                Top programs:{' '}
                {(data?.students?.by_program ?? [])
                  .slice(0, 4)
                  .map((p) => `${p.program} (${n(p.students)})`)
                  .join(' · ')}
              </p>
            ) : null}
          </ReportSection>

          <ReportSection
            id="admissions"
            title="Admissions"
            description="Application volume and where candidates sit in the admission journey."
            icon={<ClipboardList className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Applications" value={data?.admissions?.total ?? 0} />
              <Kpi label="Pending" value={data?.admissions?.pending ?? 0} />
              <Kpi label="In verification" value={data?.admissions?.verified ?? 0} />
              <Kpi label="Approved / offered" value={data?.admissions?.approved ?? 0} />
              <Kpi label="Rejected" value={data?.admissions?.rejected ?? 0} />
              <Kpi label="Withdrawn" value={data?.admissions?.withdrawn ?? 0} />
            </div>
            <Panel title="Admission pipeline">
              <Pipeline stages={data?.admissions?.pipeline ?? []} />
            </Panel>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="By program">
                <BarList
                  items={admissionBars.slice(0, 8)}
                  emptyMessage="No applications by program for this campus."
                />
              </Panel>
              <Panel title="By department">
                <DataTable
                  headers={['Department', 'Applications']}
                  emptyMessage="No applications by department for this campus."
                  rows={(data?.admissions?.by_department ?? []).map((row) => [
                    row.department,
                    n(row.count),
                  ])}
                />
              </Panel>
            </div>
          </ReportSection>

          <ReportSection
            id="enrollment"
            title="Enrollment"
            description="Students who completed admission and are enrolled, with trend over time."
            icon={<BookOpen className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Kpi label="Total enrolled" value={data?.enrollment?.total ?? 0} />
              <Kpi label="New enrollments" value={data?.enrollment?.new_enrollments ?? 0} hint="Last 90 days" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Monthly trend">
                <BarList
                  items={enrollmentBars}
                  emptyMessage="No enrollment trend data for this campus yet."
                />
              </Panel>
              <Panel title="By department">
                <DataTable
                  headers={['Department', 'Enrolled']}
                  emptyMessage="No enrollment by department for this campus."
                  rows={(data?.enrollment?.by_department ?? []).map((row) => [
                    row.department,
                    n(row.enrolled),
                  ])}
                />
              </Panel>
            </div>
            {(data?.enrollment?.by_academic_year?.length ?? 0) > 0 ? (
              <Panel title="By academic year">
                <DataTable
                  headers={['Academic year', 'Students']}
                  emptyMessage="No academic-year enrollment data."
                  rows={(data?.enrollment?.by_academic_year ?? []).map((row) => [
                    row.academic_year,
                    n(row.enrolled),
                  ])}
                />
              </Panel>
            ) : null}
          </ReportSection>

          <ReportSection
            id="departments"
            title="Departments"
            description="Department strength: students, faculty, programs, and head of department."
            icon={<Building2 className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Kpi label="Total departments" value={data?.departments?.total ?? 0} />
              <Kpi label="Active" value={data?.departments?.active ?? 0} />
            </div>
            <DataTable
              headers={[
                'Department',
                'School',
                'HOD',
                'Students',
                'Faculty',
                'Programs',
                'Status',
              ]}
              emptyMessage="No department data available for this campus."
              rows={(data?.departments?.rows ?? []).map((row) => [
                row.dept_name,
                row.school_name || '—',
                row.hod_name || '—',
                n(row.students),
                n(row.faculty),
                n(row.programs),
                <Badge
                  key={`${row.dept_name}-status`}
                  variant="outline"
                  className={
                    String(row.status).toUpperCase() === 'ACTIVE'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : ''
                  }
                >
                  {row.status || '—'}
                </Badge>,
              ])}
            />
          </ReportSection>

          <ReportSection
            id="faculty"
            title="Faculty & staff"
            description="Teaching and support staff on this campus, grouped by department."
            icon={<Users className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Faculty" value={data?.faculty?.total ?? 0} />
              <Kpi label="Active faculty" value={data?.faculty?.active ?? 0} />
              <Kpi label="Staff" value={data?.faculty?.staff ?? 0} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="By department">
                <BarList
                  items={facultyBars.slice(0, 8)}
                  emptyMessage="No faculty distribution for this campus."
                />
              </Panel>
              <Panel title="People">
                <DataTable
                  headers={['Name', 'Department', 'Designation', 'Status']}
                  emptyMessage="No faculty data available for this campus."
                  rows={(data?.faculty?.rows ?? []).map((row) => [
                    row.name,
                    row.department || '—',
                    row.designation || '—',
                    row.status || '—',
                  ])}
                />
              </Panel>
            </div>
          </ReportSection>

          <ReportSection
            id="campus"
            title="Campus profile"
            description="Snapshot of your assigned campus — schools, capacity, and facilities."
            icon={<School className="h-4 w-4" />}
          >
            <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/60 px-4 py-4">
              <p className="text-base font-semibold text-sgvu-navy">
                {data?.campus?.campus_name || 'Assigned campus'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[data?.campus?.campus_code, data?.campus?.university_name]
                  .filter(Boolean)
                  .join(' · ') || 'Campus-scoped report'}
              </p>
              {data?.campus?.address ? (
                <p className="mt-2 text-sm text-sgvu-navy/80">{data.campus.address}</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Status" value={data?.campus?.status || 'Active'} />
              <Kpi label="Schools" value={data?.campus?.schools ?? 0} />
              <Kpi label="Departments" value={data?.campus?.departments ?? 0} />
              <Kpi label="Programs" value={data?.campus?.programs ?? 0} />
              <Kpi label="Students" value={data?.campus?.students ?? 0} />
              <Kpi label="Faculty & staff" value={data?.campus?.faculty_staff ?? 0} />
              <Kpi label="Classrooms" value={data?.campus?.classrooms ?? 0} />
              <Kpi label="Bookable facilities" value={data?.campus?.facilities ?? 0} />
            </div>
          </ReportSection>

          <ReportSection
            id="users"
            title="Users"
            description="Portal accounts on this campus, by role and department."
            icon={<UserRound className="h-4 w-4" />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Total users" value={data?.users?.total ?? 0} />
              <Kpi label="Active" value={data?.users?.active ?? 0} />
              <Kpi label="Inactive" value={data?.users?.inactive ?? 0} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="By role">
                <DataTable
                  headers={['Role', 'Total', 'Active', 'Inactive']}
                  emptyMessage="No user data available for this campus."
                  rows={(data?.users?.by_role ?? []).map((row) => [
                    row.role_name,
                    n(row.total),
                    n(row.active),
                    n(row.inactive),
                  ])}
                />
              </Panel>
              <Panel title="By department">
                <BarList
                  items={(data?.users?.by_department ?? []).slice(0, 10).map((r) => ({
                    label: r.department,
                    count: Number(r.total ?? 0),
                  }))}
                  emptyMessage="No users by department for this campus."
                />
              </Panel>
            </div>
          </ReportSection>
        </>
      )}
    </div>
  );
}
