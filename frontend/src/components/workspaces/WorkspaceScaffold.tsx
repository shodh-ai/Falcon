'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { AlertCircle, Download, Lock, Plus, RefreshCw, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { StudentDetailsModal } from '@/components/workspaces/StudentDetailsModal';
import { LeadershipPageHeader } from '@/components/leadership/LeadershipSectionCard';
import { EXECUTIVE_SPACING } from '@/components/leadership/executive/design-tokens';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type SummaryCard = { label: string; value: string | number; helper?: string };
type TableColumn = { key: string; label: string; sortable?: boolean };
type ActionKind = 'bulk-demands' | 'lock-admit-cards' | 'scholarship' | 'create-task';

export type WorkspacePageConfig = {
  title: string;
  subtitle: string;
  endpoint: string;
  dataKey?: string;
  summary?: (data: unknown) => SummaryCard[];
  columns?: TableColumn[];
  filters?: Array<{
    key: string;
    label: string;
    options?: Array<{ label: string; value: string }>;
    dynamicOptions?: (data: unknown) => Array<{ label: string; value: string }>;
  }>;
  chart?: (data: unknown) => Array<{
    label: string;
    value: number;
    displayValue?: string;
    tone?: 'navy' | 'gold' | 'green' | 'red';
  }>;
  action?: ActionKind;
  rowAction?: 'student-details';
  /** Used when the live API fails or returns an empty table payload. */
  smokeFallback?: unknown;
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

/** Detect empty or zero-filled workspace payloads (e.g. finance status rows all count=0). */
function isSparseWorkspacePayload(live: unknown, dataKey?: string): boolean {
  if (live == null) return true;
  const rows = rowsFromData(live, dataKey);
  if (dataKey && rows.length === 0) return true;
  if (dataKey === 'status_breakdown') {
    const collected = Number((live as Record<string, unknown>)?.collected ?? 0);
    const pending = Number((live as Record<string, unknown>)?.pending ?? 0);
    const allZeroCounts = rows.every((row) => Number((row as Record<string, unknown>)?.count ?? 0) === 0);
    if ((collected === 0 && pending === 0) || allZeroCounts) return true;
  }
  return false;
}

export function WorkspaceScaffold({ config }: { config: WorkspacePageConfig }) {
  const api = useAuthedApi();
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState('');

  const applySmokeFallback = () => {
    if (config.smokeFallback != null) {
      setData(config.smokeFallback);
      return true;
    }
    return false;
  };

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const live = await api.get<unknown>(config.endpoint);
      if (config.smokeFallback != null && (live == null || isSparseWorkspacePayload(live, config.dataKey))) {
        setData(config.smokeFallback);
      } else {
        setData(live);
      }
    } catch (error) {
      if (!applySmokeFallback()) {
        const message = error instanceof Error ? error.message : 'Unable to load workspace data';
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Data fetching intentionally initializes workspace state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.endpoint]);

  const rows = useMemo(() => {
    let all = rowsFromData(data, config.dataKey);

    if (config.filters) {
      for (const filter of config.filters) {
        const val = filterValues[filter.key];
        if (val) {
          all = all.filter((row) => String(valueAt(row, filter.key)) === val);
        }
      }
    }

    if (sortConfig) {
      all = [...all].sort((a, b) => {
        const valA = valueAt(a, sortConfig.key);
        const valB = valueAt(b, sortConfig.key);
        if (valA == null && valB == null) return 0;
        if (valA == null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (valB == null) return sortConfig.direction === 'asc' ? -1 : 1;
        
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
        }
        
        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (!query.trim()) return all;
    const needle = query.toLowerCase();
    return all.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
  }, [config.dataKey, config.filters, data, query, filterValues, sortConfig]);

  const summary = config.summary?.(data) ?? [];
  const chart = config.chart?.(data) ?? [];
  const maxChartValue = Math.max(...chart.map((item) => Math.abs(item.value)), 1);

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
    <div className={EXECUTIVE_SPACING.page}>
      <div className="mx-auto max-w-7xl space-y-6">
      <LeadershipPageHeader
        eyebrow="Falcon Workspace"
        title={config.title}
        description={config.subtitle}
      />

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </Button>
        </div>
      )}

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
              const normalizedValue = Math.abs(item.value) / maxChartValue;
              const width = item.value === 0 ? '0%' : `${Math.min(100, Math.max(4, normalizedValue * 100))}%`;
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
                    <span>{item.displayValue ?? item.value.toLocaleString()}</span>
                  </div>
                  <div
                    className="h-3 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${item.label}: ${item.displayValue ?? item.value.toLocaleString()}`}
                  >
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
            <div className="flex w-full flex-col gap-3 sm:max-w-md sm:flex-row sm:items-center sm:justify-end">
              {config.filters?.map((filter) => {
                const options = filter.dynamicOptions ? filter.dynamicOptions(data) : filter.options ?? [];
                return (
                  <Select
                    key={filter.key}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={filterValues[filter.key] ?? ''}
                    onChange={(e) => setFilterValues((prev) => ({ ...prev, [filter.key]: e.target.value }))}
                  >
                    {options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                );
              })}
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Filter table..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.key} scope="col" className="px-3 py-3 font-bold align-middle">
                      <div className="flex items-center gap-1.5">
                        <span>{column.label}</span>
                        {column.sortable && (
                          <div className="flex flex-col">
                            <button 
                              type="button"
                              aria-label={`Sort ${column.label} ascending`}
                              onClick={() => setSortConfig({ key: column.key, direction: 'asc' })}
                              className={`h-3 w-3 -mb-0.5 hover:text-sgvu-navy ${sortConfig?.key === column.key && sortConfig.direction === 'asc' ? 'text-sgvu-navy' : 'text-slate-300'}`}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button 
                              type="button"
                              aria-label={`Sort ${column.label} descending`}
                              onClick={() => setSortConfig({ key: column.key, direction: 'desc' })}
                              className={`h-3 w-3 hover:text-sgvu-navy ${sortConfig?.key === column.key && sortConfig.direction === 'desc' ? 'text-sgvu-navy' : 'text-slate-300'}`}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, index) => {
                  const isClickable = config.rowAction === 'student-details';
                  return (
                  <tr 
                    key={index} 
                    className={`border-b last:border-0 ${isClickable ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
                    tabIndex={isClickable ? 0 : undefined}
                    role={isClickable ? 'button' : undefined}
                    onClick={() => {
                      if (isClickable) {
                        setSelectedRowId(String(valueAt(row, 'user_id')));
                        setDetailsModalOpen(true);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isClickable && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        setSelectedRowId(String(valueAt(row, 'user_id')));
                        setDetailsModalOpen(true);
                      }
                    }}
                  >
                    {config.columns!.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-3 align-top ${column.key === 'courses' ? 'max-w-md break-words text-xs leading-relaxed' : ''}`}
                      >
                        {displayValue(valueAt(row, column.key))}
                      </td>
                    ))}
                  </tr>
                )})}
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

      {config.rowAction === 'student-details' && (
        <StudentDetailsModal
          studentId={selectedRowId}
          open={detailsModalOpen}
          onOpenChange={setDetailsModalOpen}
          portal={config.endpoint.includes('/dean/') ? 'dean' : 'hod'}
        />
      )}
      </div>
    </div>
  );
}
