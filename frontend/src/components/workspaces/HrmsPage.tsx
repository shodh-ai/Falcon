'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Play, Search } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { KanbanBoard, type KanbanColumn } from '@/components/workspaces/KanbanBoard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type HrPageKind =
  | 'dashboard'
  | 'directory'
  | 'attendance'
  | 'leaves'
  | 'holidays'
  | 'structures'
  | 'payrollRun'
  | 'jobs'
  | 'pipeline'
  | 'onboarding'
  | 'offboarding'
  | 'appraisals'
  | 'kpis';

const configs: Record<HrPageKind, { title: string; subtitle: string; endpoint: string; dataKey?: string; columns?: string[] }> = {
  dashboard: {
    title: 'HR Command Center',
    subtitle: 'Falcon HRMS snapshot across workforce, attendance, leave, and payroll readiness.',
    endpoint: '/api/hr/dashboard/metrics',
  },
  directory: {
    title: 'Employee Directory',
    subtitle: 'Master employee database with search and 360 profile access.',
    endpoint: '/api/hr/employees',
    columns: ['name', 'email', 'role', 'department', 'salary_base', 'is_active'],
  },
  attendance: {
    title: 'Attendance Matrix',
    subtitle: 'Wide-grid monthly attendance matrix for payroll and LWP decisions.',
    endpoint: `/api/hr/attendance/matrix?month=${new Date().toISOString().slice(0, 7)}`,
    dataKey: 'employees',
  },
  leaves: {
    title: 'Leave Queue',
    subtitle: 'Master HR queue for requests that need final logging or action.',
    endpoint: '/api/hr/leaves/all?status=HOD_APPROVED',
    columns: ['staff.name', 'leave_type', 'start_date', 'end_date', 'reason', 'status'],
  },
  holidays: {
    title: 'University Holidays',
    subtitle: 'Configure non-working days so payroll never deducts incorrectly.',
    endpoint: '/api/hr/holidays',
    columns: ['name', 'start_date', 'end_date', 'type'],
  },
  structures: {
    title: 'Salary Structures',
    subtitle: 'Define salary templates and map them to employees.',
    endpoint: '/api/hr/payroll/structures',
    columns: ['structure_name', 'employee_name', 'basic', 'hra', 'da', 'pf', 'tax_deduction'],
  },
  payrollRun: {
    title: 'Run Payroll',
    subtitle: 'Queue payroll generation for the current month with progress feedback.',
    endpoint: '/api/hr/payroll/payslips',
    columns: ['staff.name', 'month', 'year', 'gross_pay', 'net_pay', 'is_published'],
  },
  jobs: {
    title: 'Recruitment Job Postings',
    subtitle: 'Create and manage open faculty and staff positions.',
    endpoint: '/api/hr/recruitment/jobs',
    columns: ['title', 'department_name', 'employment_type', 'openings', 'status'],
  },
  pipeline: {
    title: 'Recruitment Pipeline',
    subtitle: 'Applicant tracking Kanban from Applied to Hired.',
    endpoint: '/api/hr/recruitment/pipeline',
  },
  onboarding: {
    title: 'Onboarding',
    subtitle: 'Checklist for email creation, ID card printing, and workstation allocation.',
    endpoint: '/api/hr/onboarding',
    columns: ['applicant_name', 'department_owner', 'task_name', 'status', 'due_date'],
  },
  offboarding: {
    title: 'Offboarding',
    subtitle: 'Digital no-dues clearance across Library, IT, and Finance.',
    endpoint: '/api/hr/offboarding',
    columns: ['employee_name', 'department_owner', 'task_name', 'status', 'due_date'],
  },
  appraisals: {
    title: 'Appraisal Cycles',
    subtitle: 'Configure yearly or semester-wise PMS cycles.',
    endpoint: '/api/hr/pms/appraisals',
    columns: ['name', 'start_date', 'end_date', 'status', 'submissions'],
  },
  kpis: {
    title: 'Faculty KPIs',
    subtitle: 'Research, patents, feedback scores, and grants secured.',
    endpoint: '/api/hr/pms/faculty-kpis',
    columns: ['employee_name', 'cycle_name', 'research_papers', 'patents', 'student_feedback_score', 'grants_secured'],
  },
};

function valueAt(row: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) return (acc as Record<string, unknown>)[part];
    return undefined;
  }, row);
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rowsFrom(data: unknown, dataKey?: string) {
  const source = dataKey ? valueAt(data, dataKey) : data;
  return Array.isArray(source) ? source : [];
}

export function HrmsPage({ kind }: { kind: HrPageKind }) {
  const config = configs[kind];
  const api = useAuthedApi();
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [job, setJob] = useState<{ progress: number; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get(config.endpoint));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load HRMS page');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.endpoint]);

  const rows = useMemo(() => {
    const all = rowsFrom(data, config.dataKey);
    if (!query.trim()) return all;
    return all.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  }, [config.dataKey, data, query]);

  const runPayroll = async () => {
    const month = new Date().toISOString().slice(0, 7);
    const result = await api.post<{ progress: number; message: string }>('/api/hr/payroll/run', { month });
    setJob(result);
    toast.success('Payroll job queued');
  };

  const moveApplicant = async (cardId: string, nextStage: string) => {
    await api.patch(`/api/hr/recruitment/applicants/${cardId}/stage`, { stage: nextStage });
    toast.success('Applicant moved');
    await load();
  };

  if (loading) return <FalconLoader label={`Loading ${config.title}…`} />;

  const metrics = data as Record<string, number> | null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">Falcon HRMS</p>
        <h2 className="mt-1 text-2xl font-black text-sgvu-navy sm:text-3xl">{config.title}</h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{config.subtitle}</p>
      </section>

      {kind === 'dashboard' && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Headcount', metrics?.headcount ?? 0],
            ['Present Today', metrics?.present_today ?? 0],
            ['On Leave Today', metrics?.on_leave_today ?? 0],
            ['Pending Actions', metrics?.pending_actions ?? 0],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-3xl font-black">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {kind === 'pipeline' && (
        <KanbanBoard
          columns={((data as { stages?: Array<{ id: string; title: string; cards: Array<Record<string, unknown>> }> })?.stages ?? []).map(
            (stage) => ({
              id: stage.id,
              title: stage.title,
              cards: stage.cards.map((card) => ({
                id: String(card.applicant_id),
                title: String(card.name),
                subtitle: String(card.job_title ?? card.email),
                meta: String(card.email),
              })),
            }),
          ) as KanbanColumn[]}
          onMove={moveApplicant}
        />
      )}

      {kind === 'payrollRun' && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Payroll</CardTitle>
            <CardDescription>Queues BullMQ payroll generation and returns immediately with progress.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runPayroll}>
              <Play className="h-4 w-4" />
              Run Payroll for Current Month
            </Button>
            {job && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{job.message}</p>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-sgvu-gold" style={{ width: `${job.progress}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {kind !== 'dashboard' && kind !== 'pipeline' && config.columns && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Data Table</CardTitle>
              <CardDescription>{rows.length} records</CardDescription>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {config.columns.map((column) => (
                    <th key={column} className="px-3 py-3 font-bold">
                      {column.replaceAll('_', ' ')}
                    </th>
                  ))}
                  {kind === 'directory' && <th className="px-3 py-3 font-bold">Profile</th>}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {config.columns!.map((column) => (
                      <td key={column} className="px-3 py-3 align-top">
                        {column === 'status' ? <Badge variant="secondary">{display(valueAt(row, column))}</Badge> : display(valueAt(row, column))}
                      </td>
                    ))}
                    {kind === 'directory' && (
                      <td className="px-3 py-3">
                        <Link className="text-sm font-semibold text-sgvu-navy underline" href={`/hr/employee/${valueAt(row, 'user_id')}`}>
                          Open 360°
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {kind === 'attendance' && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Calendar Grid</CardTitle>
            <CardDescription>Green = present, red = absent, yellow = leave.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1100px] text-xs">
              <tbody>
                {rows.map((employee, index) => (
                  <tr key={index} className="border-b">
                    <td className="sticky left-0 bg-background px-3 py-2 font-semibold">{display(valueAt(employee, 'name'))}</td>
                    {(valueAt(employee, 'days') as Array<{ status: string }> | undefined)?.map((day, dayIndex) => (
                      <td key={dayIndex} className="px-1 py-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                            day.status === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-700'
                              : day.status === 'LEAVE'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {day.status === 'PRESENT' ? 'P' : day.status === 'LEAVE' ? 'L' : 'A'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
