'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Lock, Plus, Search } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type SummaryCard = { label: string; value: string | number; helper?: string };
type TableColumn = { key: string; label: string };
type ActionKind = 'bulk-demands' | 'lock-admit-cards' | 'scholarship' | 'create-task';

export type WorkspacePageConfig = {
  title: string;
  subtitle: string;
  endpoint: string;
  dataKey?: string;
  summary?: (data: unknown) => SummaryCard[];
  columns?: TableColumn[];
  chart?: (data: unknown) => Array<{ label: string; value: number; tone?: 'navy' | 'gold' | 'green' | 'red' }>;
  action?: ActionKind;
};

function valueAt(row: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) return (acc as Record<string, unknown>)[part];
    return undefined;
  }, row);
}

const ISO_DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatCourseAllocations(value: unknown[]) {
  const seen = new Set<string>();
  return value
    .filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      const key = String(row.course_id ?? row.course_code ?? row.timetable_id ?? '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      const row = item as Record<string, unknown>;
      const code = String(row.course_code ?? '').trim();
      const name = String(row.course_name ?? '').trim();
      const slots = value.filter(
        (slot) =>
          slot &&
          typeof slot === 'object' &&
          String((slot as Record<string, unknown>).course_id ?? '') === String(row.course_id ?? ''),
      );
      const schedule = slots
        .map((slot) => {
          const s = slot as Record<string, unknown>;
          const day = Number(s.day_of_week);
          const dayLabel = Number.isFinite(day) ? (ISO_DAY_LABELS[day] ?? `Day ${day}`) : '';
          const start = String(s.start_time ?? '').slice(0, 5);
          return dayLabel && start ? `${dayLabel} ${start}` : '';
        })
        .filter(Boolean)
        .join(', ');
      const label = code && name ? `${code} · ${name}` : code || name || 'Course';
      return schedule ? `${label} (${schedule})` : label;
    })
    .join('; ');
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toString() : value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString();
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    if (value.every((item) => item && typeof item === 'object' && ('course_code' in item || 'course_name' in item))) {
      return formatCourseAllocations(value);
    }
    return value.map((item) => displayValue(item)).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rowsFromData(data: unknown, dataKey?: string): unknown[] {
  const source = dataKey ? valueAt(data, dataKey) : data;
  return Array.isArray(source) ? source : [];
}

export function WorkspaceScaffold({ config }: { config: WorkspacePageConfig }) {
  const api = useAuthedApi();
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState(false);
  const [studentId, setStudentId] = useState('');

  if (!config) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-background p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-sgvu-navy">Workspace route is not configured</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Falcon could not load the page configuration for this route.
        </p>
      </div>
    );
  }

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get<unknown>(config.endpoint));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load workspace data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.endpoint]);

  const rows = useMemo(() => {
    const all = rowsFromData(data, config.dataKey);
    if (!query.trim()) return all;
    const needle = query.toLowerCase();
    return all.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [config.dataKey, data, query]);

  const summary = config.summary?.(data) ?? [];
  const chart = config.chart?.(data) ?? [];

  const runAction = async () => {
    setActing(true);
    try {
      if (config.action === 'bulk-demands') {
        await api.post('/finance/demands/bulk-generate', {
          program: 'B.Tech',
          semester: 3,
          tuition_fee: 85000,
          development_fee: 15000,
        });
      }
      if (config.action === 'lock-admit-cards') {
        await api.post('/finance/defaulters/lock-admit-cards');
      }
      if (config.action === 'scholarship') {
        await api.post('/finance/scholarships', {
          student_user_id: studentId,
          discount_percent: 50,
        });
      }
      if (config.action === 'create-task') {
        await api.post('/iqac/task-master', {
          task_name: 'Monthly Department Compliance Pack',
          task_description: 'Submit faculty workload, attendance, and evidence summary.',
          month: new Date().toLocaleString('en-US', { month: 'long' }),
        });
      }
      toast.success('Action completed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <FalconLoader label={`Loading ${config.title}…`} />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold">Falcon Workspace</p>
        <h2 className="mt-1 text-2xl font-black text-sgvu-navy sm:text-3xl">{config.title}</h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{config.subtitle}</p>
      </section>

      {summary.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {summary.map((item) => (
            <Card key={item.label}>
              <CardHeader>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-3xl font-black">{item.value}</CardTitle>
              </CardHeader>
              {item.helper && <CardContent className="pt-0 text-sm text-muted-foreground">{item.helper}</CardContent>}
            </Card>
          ))}
        </div>
      )}

      {chart.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Visual Analytics</CardTitle>
            <CardDescription>Falcon-grade quick chart for leadership review</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {chart.map((item) => {
              const width = `${Math.min(100, Math.max(8, item.value))}%`;
              const color =
                item.tone === 'gold'
                  ? 'bg-sgvu-gold'
                  : item.tone === 'green'
                    ? 'bg-emerald-500'
                    : item.tone === 'red'
                      ? 'bg-red-500'
                      : 'bg-sgvu-navy';
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{item.label}</span>
                    <span>{item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${color}`} style={{ width }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {config.action && (
        <Card>
          <CardHeader>
            <CardTitle>Workspace Action</CardTitle>
            <CardDescription>Dedicated action for this feature route</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {config.action === 'scholarship' && (
              <Input
                placeholder="student_user_id for 50% scholarship"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              />
            )}
            <Button onClick={runAction} disabled={acting || (config.action === 'scholarship' && !studentId.trim())}>
              {config.action === 'lock-admit-cards' ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {config.action === 'bulk-demands' && 'Generate B.Tech Sem 3 Demands'}
              {config.action === 'lock-admit-cards' && 'Lock Admit Cards'}
              {config.action === 'scholarship' && 'Apply 50% Scholarship'}
              {config.action === 'create-task' && 'Create Monthly Task'}
            </Button>
          </CardContent>
        </Card>
      )}

      {config.columns && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Data Table</CardTitle>
              <CardDescription>{rows.length} records</CardDescription>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Filter table..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.key} className="px-3 py-3 font-bold">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {config.columns!.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-3 align-top ${column.key === 'courses' ? 'max-w-md break-words text-xs leading-relaxed' : ''}`}
                      >
                        {displayValue(valueAt(row, column.key))}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <Badge variant="secondary">Live</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No records found.</p>}
            {config.title.includes('Transactions') && (
              <Button variant="outline" className="mt-4">
                <Download className="h-4 w-4" />
                Download Receipt
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
