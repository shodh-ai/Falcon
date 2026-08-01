'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Filter,
  Gavel,
  MoreHorizontal,
  ScrollText,
  Search,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EXECUTIVE_CHART_COLORS,
  EXECUTIVE_CHART_TOOLTIP,
} from '@/components/leadership/executive/design-tokens';
import {
  GOVERNANCE_COMPLETED_TREND,
  GOVERNANCE_KPIS,
  GOVERNANCE_NOTIFICATIONS,
  GOVERNANCE_OFFICERS,
  GOVERNANCE_TIMELINE,
  INITIAL_GOVERNANCE_TASKS,
  type GovernanceCategory,
  type GovernancePriority,
  type GovernanceStatus,
  type GovernanceTask,
} from '@/components/admin/governance-tasks-data';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 5;

type CreateKind = 'policy' | 'circular' | 'meeting';

const CREATE_META: Record<
  CreateKind,
  { title: string; category: GovernanceCategory; status: GovernanceStatus; placeholder: string }
> = {
  policy: {
    title: 'Create New Policy',
    category: 'Policy Approval',
    status: 'Pending',
    placeholder: 'e.g. Academic Integrity Policy 2026',
  },
  circular: {
    title: 'Create Circular',
    category: 'Circular',
    status: 'Pending',
    placeholder: 'e.g. Examination Schedule Circular',
  },
  meeting: {
    title: 'Schedule Meeting',
    category: 'Meeting',
    status: 'Scheduled',
    placeholder: 'e.g. Academic Council Meeting',
  },
};

function formatDueLabel(iso: string): string {
  if (!iso) return 'TBD';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function nextTaskId(tasks: GovernanceTask[]): string {
  let max = 1000;
  for (const task of tasks) {
    const n = Number(task.id.replace(/\D/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `GV-${max + 1}`;
}

function downloadCsv(filename: string, rows: GovernanceTask[]) {
  const header = [
    'Task ID',
    'Title',
    'Category',
    'Assigned By',
    'Due Date',
    'Priority',
    'Status',
    'Assignee',
    'Department',
    'Remarks',
  ];
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    header.join(','),
    ...rows.map((t) =>
      [
        t.id,
        t.title,
        t.category,
        t.assignedBy,
        t.dueSort,
        t.priority,
        t.status,
        t.assignee ?? '',
        t.department ?? '',
        t.remarks ?? '',
      ]
        .map(escape)
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_BADGE: Record<GovernanceStatus, string> = {
  Pending: 'border-amber-200 bg-amber-50 text-amber-800',
  Approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Rejected: 'border-red-200 bg-red-50 text-red-800',
  Returned: 'border-slate-200 bg-slate-100 text-slate-700',
  'In Review': 'border-blue-200 bg-blue-50 text-blue-800',
  Scheduled: 'border-purple-200 bg-purple-50 text-purple-800',
};

const PRIORITY_BADGE: Record<GovernancePriority, string> = {
  Critical: 'border-red-300 bg-red-100 text-red-800',
  High: 'border-orange-200 bg-orange-50 text-orange-800',
  Medium: 'border-amber-200 bg-amber-50 text-amber-800',
  Low: 'border-slate-200 bg-slate-50 text-slate-700',
};

const KPI_TONE: Record<(typeof GOVERNANCE_KPIS)[number]['tone'], string> = {
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  navy: 'bg-sgvu-navy/5 text-sgvu-navy',
};

const KPI_ICON = {
  pending: ClipboardList,
  policy: FileText,
  circular: ScrollText,
  meeting: CalendarDays,
  academic: Users,
  executive: Gavel,
} as const;

const FILTER_CHIPS = [
  'All',
  'Pending',
  'Approved',
  'Rejected',
  'Meetings',
  'Policy',
  'Circulars',
  'Academic Council',
  'Executive Council',
] as const;

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy';

const PIE_COLORS = ['#d97706', '#059669', '#dc2626', '#64748b'];

type SortKey = 'id' | 'title' | 'category' | 'assignedBy' | 'dueSort' | 'priority' | 'status';

function matchesChip(task: GovernanceTask, chip: string): boolean {
  if (chip === 'All') return true;
  if (chip === 'Meetings') return task.category === 'Meeting';
  if (chip === 'Policy') return task.category === 'Policy Approval';
  if (chip === 'Circulars') return task.category === 'Circular';
  if (chip === 'Academic Council') return task.category === 'Academic Council';
  if (chip === 'Executive Council') return task.category === 'Executive Council';
  return task.status === chip;
}

function priorityRank(p: GovernancePriority): number {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[p];
}

export function GovernanceTasksPanel({ compact = false }: { compact?: boolean }) {
  const [tasks, setTasks] = useState<GovernanceTask[]>(INITIAL_GOVERNANCE_TASKS);
  const [chip, setChip] = useState<(typeof FILTER_CHIPS)[number]>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('dueSort');
  const [sortAsc, setSortAsc] = useState(true);

  const [assignTask, setAssignTask] = useState<GovernanceTask | null>(null);
  const [priorityTask, setPriorityTask] = useState<GovernanceTask | null>(null);
  const [detailTask, setDetailTask] = useState<GovernanceTask | null>(null);
  const [officerName, setOfficerName] = useState(GOVERNANCE_OFFICERS[0]?.name ?? '');
  const [officerDept, setOfficerDept] = useState(GOVERNANCE_OFFICERS[0]?.department ?? '');
  const [assignDue, setAssignDue] = useState('');
  const [assignRemarks, setAssignRemarks] = useState('');
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);

  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createPriority, setCreatePriority] = useState<GovernancePriority>('High');
  const [createDue, setCreateDue] = useState('');
  const [createAssignedBy, setCreateAssignedBy] = useState('Registrar Office');
  const [createRemarks, setCreateRemarks] = useState('');
  const [createCouncil, setCreateCouncil] = useState<'Meeting' | 'Academic Council' | 'Executive Council'>(
    'Meeting',
  );
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = tasks.filter((task) => matchesChip(task, chip));
    if (priorityFilter !== 'all') {
      rows = rows.filter((task) => task.priority === priorityFilter);
    }
    if (q) {
      rows = rows.filter(
        (task) =>
          task.id.toLowerCase().includes(q) ||
          task.title.toLowerCase().includes(q) ||
          task.category.toLowerCase().includes(q) ||
          task.assignedBy.toLowerCase().includes(q),
      );
    }
    if (dateFrom) rows = rows.filter((task) => task.dueSort >= dateFrom);
    if (dateTo) rows = rows.filter((task) => task.dueSort <= dateTo);

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'priority') cmp = priorityRank(a.priority) - priorityRank(b.priority);
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [tasks, chip, priorityFilter, search, dateFrom, dateTo, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const distribution = useMemo(() => {
    const counts: Record<string, number> = {
      Pending: 0,
      Approved: 0,
      Rejected: 0,
      Returned: 0,
    };
    for (const task of tasks) {
      if (task.status in counts) counts[task.status] += 1;
      else if (task.status === 'In Review' || task.status === 'Scheduled') counts.Pending += 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function updateTask(id: string, patch: Partial<GovernanceTask>) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function onApprove(task: GovernanceTask) {
    updateTask(task.id, { status: 'Approved' });
    toast.success(`${task.id} approved`);
    setActionsOpenId(null);
  }

  function onReject(task: GovernanceTask) {
    updateTask(task.id, { status: 'Rejected' });
    toast.error(`${task.id} rejected`);
    setActionsOpenId(null);
  }

  function onSendBack(task: GovernanceTask) {
    updateTask(task.id, { status: 'Returned' });
    toast.success(`${task.id} sent back for revision`);
    setActionsOpenId(null);
  }

  function openAssign(task: GovernanceTask) {
    setAssignTask(task);
    setOfficerName(GOVERNANCE_OFFICERS[0]?.name ?? '');
    setOfficerDept(GOVERNANCE_OFFICERS[0]?.department ?? '');
    setAssignDue(task.dueSort);
    setAssignRemarks('');
    setActionsOpenId(null);
  }

  function confirmAssign() {
    if (!assignTask) return;
    if (!officerName.trim()) {
      toast.error('Select an officer');
      return;
    }
    updateTask(assignTask.id, {
      assignee: officerName,
      department: officerDept,
      dueSort: assignDue || assignTask.dueSort,
      remarks: assignRemarks,
      status: 'In Review',
    });
    toast.success(`Assigned ${assignTask.id} to ${officerName}`);
    setAssignTask(null);
  }

  function confirmPriority(priority: GovernancePriority) {
    if (!priorityTask) return;
    updateTask(priorityTask.id, { priority });
    toast.success(`${priorityTask.id} priority set to ${priority}`);
    setPriorityTask(null);
  }

  function openCreate(kind: CreateKind) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setCreateKind(kind);
    setCreateTitle('');
    setCreatePriority(kind === 'meeting' ? 'High' : 'Medium');
    setCreateDue(tomorrow.toISOString().slice(0, 10));
    setCreateAssignedBy('Registrar Office');
    setCreateRemarks('');
    setCreateCouncil('Meeting');
  }

  function confirmCreate() {
    if (!createKind) return;
    const title = createTitle.trim();
    if (!title) {
      toast.error('Enter a title');
      return;
    }
    if (!createDue) {
      toast.error('Select a due date');
      return;
    }
    const meta = CREATE_META[createKind];
    const category: GovernanceCategory =
      createKind === 'meeting' ? createCouncil : meta.category;
    const task: GovernanceTask = {
      id: nextTaskId(tasks),
      title,
      category,
      assignedBy: createAssignedBy.trim() || 'Registrar Office',
      dueDate: formatDueLabel(createDue),
      dueSort: createDue,
      priority: createPriority,
      status: meta.status,
      remarks: createRemarks.trim() || undefined,
    };
    setTasks((prev) => [task, ...prev]);
    setChip('All');
    setPage(1);
    setCreateKind(null);
    toast.success(`${task.id} added to the governance register`);
  }

  function exportReport() {
    const rows = filtered.length ? filtered : tasks;
    if (!rows.length) {
      toast.error('No tasks to export');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`governance-tasks-${stamp}.csv`, rows);
    toast.success(`Exported ${rows.length} task${rows.length === 1 ? '' : 's'}`);
  }

  const calendarItems = useMemo(() => {
    const fromTasks = tasks
      .filter((t) => t.status === 'Scheduled' || t.category === 'Meeting' || t.dueSort)
      .map((t) => ({
        id: t.id,
        title: t.title,
        when: `${formatDueLabel(t.dueSort)} · ${t.dueSort}`,
        meta: `${t.category} · ${t.priority}`,
        sort: t.dueSort,
      }));
    const fromTimeline = GOVERNANCE_TIMELINE.map((item, i) => ({
      id: `tl-${i}`,
      title: item.title,
      when: item.when,
      meta: 'Scheduled activity',
      sort: `2099-0${i}`,
    }));
    return [...fromTasks, ...fromTimeline].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [tasks]);

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')} data-testid="governance-tasks-panel">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Registrar workspace
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Governance Tasks</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage university governance approvals, committees, and policy workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(BRAND_BTN, 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-bold')}
              onClick={() => openCreate('policy')}
            >
              Create New Policy
            </button>
            <button
              type="button"
              className={cn(BRAND_BTN, 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-bold')}
              onClick={() => openCreate('circular')}
            >
              Create Circular
            </button>
            <button
              type="button"
              className={cn(BRAND_BTN, 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-bold')}
              onClick={() => openCreate('meeting')}
            >
              Schedule Meeting
            </button>
            <button
              type="button"
              className={cn(BRAND_BTN, 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-bold')}
              onClick={() => setCalendarOpen(true)}
            >
              View Calendar
            </button>
            <button
              type="button"
              className={cn(BRAND_BTN, 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-bold')}
              onClick={exportReport}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Report
            </button>
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {GOVERNANCE_KPIS.map((kpi) => {
          const Icon = KPI_ICON[kpi.icon];
          return (
            <Card key={kpi.key} className="border-sgvu-navy/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {kpi.label}
                  </p>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', KPI_TONE[kpi.tone])}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-black tabular-nums text-sgvu-navy">
                  {kpi.count}
                </p>
                <p className={cn('mt-1 text-xs font-semibold', KPI_TONE[kpi.tone].split(' ')[1])}>
                  {kpi.tone === 'red' ? '🔴' : kpi.tone === 'amber' ? '🟡' : kpi.tone === 'green' ? '🟢' : '🔵'}{' '}
                  {kpi.statusLabel}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-3 p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-sgvu-gold" />
            <p className="text-sm font-bold text-sgvu-navy">Filters</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTER_CHIPS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setChip(item);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition',
                  chip === item
                    ? 'border-sgvu-navy bg-sgvu-navy text-white'
                    : 'border-sgvu-navy/15 bg-white text-sgvu-navy hover:border-sgvu-gold/50',
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search task ID, title, category…"
                className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                aria-label="Search governance tasks"
              />
            </label>
            <Select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border-sgvu-navy/15"
            >
              <option value="all">All priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border-sgvu-navy/15"
                aria-label="From date"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border-sgvu-navy/15"
                aria-label="To date"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Table */}
        <Card className="border-sgvu-navy/10 bg-white shadow-sm xl:col-span-3">
          <CardContent className="p-0">
            <div className="border-b border-sgvu-navy/10 px-5 py-4">
              <h3 className="text-base font-bold text-sgvu-navy">Governance task register</h3>
              <p className="text-xs text-muted-foreground">
                {filtered.length} task{filtered.length === 1 ? '' : 's'} · page {page} of {totalPages}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sgvu-surface/60 hover:bg-sgvu-surface/60">
                    {(
                      [
                        ['id', 'Task ID'],
                        ['title', 'Task Title'],
                        ['category', 'Category'],
                        ['assignedBy', 'Assigned By'],
                        ['dueSort', 'Due Date'],
                        ['priority', 'Priority'],
                        ['status', 'Status'],
                      ] as Array<[SortKey, string]>
                    ).map(([key, label]) => (
                      <TableHead key={key}>
                        <button
                          type="button"
                          className="font-bold text-sgvu-navy"
                          onClick={() => toggleSort(key)}
                        >
                          {label}
                          {sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                        </button>
                      </TableHead>
                    ))}
                    <TableHead className="font-bold text-sgvu-navy">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                        No governance tasks match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((task) => (
                      <TableRow key={task.id} className="align-top">
                        <TableCell className="font-mono text-xs font-semibold text-sgvu-navy">
                          {task.id}
                        </TableCell>
                        <TableCell className="max-w-[180px] font-medium text-sgvu-navy">
                          {task.title}
                        </TableCell>
                        <TableCell className="text-xs">{task.category}</TableCell>
                        <TableCell className="text-xs">{task.assignedBy}</TableCell>
                        <TableCell className="text-xs">{task.dueDate}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PRIORITY_BADGE[task.priority]}>
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[task.status]}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="relative">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-sgvu-navy/15 px-2"
                              aria-label={`Actions for ${task.id}`}
                              onClick={() =>
                                setActionsOpenId((id) => (id === task.id ? null : task.id))
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            {actionsOpenId === task.id ? (
                              <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-sgvu-navy/10 bg-white p-1.5 shadow-lg">
                                <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => onApprove(task)}>
                                  Approve
                                </button>
                                <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => onReject(task)}>
                                  Reject
                                </button>
                                <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-orange-700 hover:bg-orange-50" onClick={() => onSendBack(task)}>
                                  Send Back
                                </button>
                                <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50" onClick={() => openAssign(task)}>
                                  Assign Officer
                                </button>
                                <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-purple-700 hover:bg-purple-50" onClick={() => { setPriorityTask(task); setActionsOpenId(null); }}>
                                  Set Priority
                                </button>
                                <button type="button" className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-sgvu-navy hover:bg-sgvu-surface" onClick={() => { setDetailTask(task); setActionsOpenId(null); }}>
                                  View Details
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-sgvu-navy/10 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + (pageRows.length ? 1 : 0)}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={cn(
                    'inline-flex h-10 min-w-[6.5rem] items-center justify-center rounded-lg px-4 text-sm font-bold transition-colors',
                    page <= 1
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-[#0B2447] text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy',
                  )}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={cn(
                    'inline-flex h-10 min-w-[6.5rem] items-center justify-center rounded-lg px-4 text-sm font-bold transition-colors',
                    page >= totalPages
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-[#0B2447] text-white hover:bg-[#123A6D] active:bg-sgvu-gold active:text-sgvu-navy',
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Side panels */}
        <div className="space-y-4 xl:col-span-2">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                Timeline
              </p>
              <h3 className="mt-1 text-base font-bold text-sgvu-navy">Upcoming governance activities</h3>
              <ul className="mt-4 space-y-3">
                {GOVERNANCE_TIMELINE.map((item) => (
                  <li
                    key={item.title}
                    className="rounded-xl border border-sgvu-navy/10 px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold text-sgvu-navy">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.when}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
                <Bell className="h-3.5 w-3.5" />
                Notifications
              </p>
              <h3 className="mt-1 text-base font-bold text-sgvu-navy">Recent governance updates</h3>
              <ul className="mt-4 space-y-2.5">
                {GOVERNANCE_NOTIFICATIONS.map((note) => (
                  <li
                    key={note}
                    className="rounded-xl bg-sgvu-surface/70 px-3 py-2 text-xs leading-relaxed text-sgvu-navy"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Analytics */}
      {!compact ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5 md:p-6">
              <h3 className="text-base font-bold text-sgvu-navy">Task distribution</h3>
              <p className="text-xs text-muted-foreground">Pending · Approved · Rejected · Returned</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {distribution.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={EXECUTIVE_CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {distribution.map((entry, index) => (
                  <span key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    {entry.name} ({entry.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-sgvu-navy/10 bg-white shadow-sm">
            <CardContent className="p-5 md:p-6">
              <h3 className="text-base font-bold text-sgvu-navy">Governance tasks completed</h3>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={GOVERNANCE_COMPLETED_TREND}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={EXECUTIVE_CHART_TOOLTIP} />
                    <Bar dataKey="completed" name="Completed" fill={EXECUTIVE_CHART_COLORS.navy} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Assign Officer modal */}
      <Dialog open={Boolean(assignTask)} onOpenChange={(open) => !open && setAssignTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">Assign Officer</DialogTitle>
            <DialogDescription>
              Route {assignTask?.id} to a responsible officer with due date and remarks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Officer Name</span>
              <Select
                value={officerName}
                onChange={(e) => {
                  const next = e.target.value;
                  setOfficerName(next);
                  const match = GOVERNANCE_OFFICERS.find((o) => o.name === next);
                  if (match) setOfficerDept(match.department);
                }}
                className="h-10 rounded-xl border-sgvu-navy/15"
              >
                {GOVERNANCE_OFFICERS.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Department</span>
              <Input
                value={officerDept}
                onChange={(e) => setOfficerDept(e.target.value)}
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Due Date</span>
              <Input
                type="date"
                value={assignDue}
                onChange={(e) => setAssignDue(e.target.value)}
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Remarks</span>
              <Input
                value={assignRemarks}
                onChange={(e) => setAssignRemarks(e.target.value)}
                placeholder="Optional instructions"
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignTask(null)}>
              Cancel
            </Button>
            <Button type="button" className={BRAND_BTN} onClick={confirmAssign}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Priority modal */}
      <Dialog open={Boolean(priorityTask)} onOpenChange={(open) => !open && setPriorityTask(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">Set Priority</DialogTitle>
            <DialogDescription>
              Choose priority for {priorityTask?.id}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(['Critical', 'High', 'Medium', 'Low'] as GovernancePriority[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => confirmPriority(level)}
                className={cn(
                  'rounded-xl border px-3 py-3 text-sm font-bold transition hover:shadow-sm',
                  PRIORITY_BADGE[level],
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details modal */}
      <Dialog open={Boolean(detailTask)} onOpenChange={(open) => !open && setDetailTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">{detailTask?.title}</DialogTitle>
            <DialogDescription>{detailTask?.id}</DialogDescription>
          </DialogHeader>
          {detailTask ? (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Category</p>
                <p className="mt-1 font-semibold text-sgvu-navy">{detailTask.category}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Assigned By</p>
                <p className="mt-1 font-semibold text-sgvu-navy">{detailTask.assignedBy}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Due Date</p>
                <p className="mt-1 font-semibold text-sgvu-navy">{detailTask.dueDate}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Priority</p>
                <Badge variant="outline" className={cn('mt-1', PRIORITY_BADGE[detailTask.priority])}>
                  {detailTask.priority}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</p>
                <Badge variant="outline" className={cn('mt-1', STATUS_BADGE[detailTask.status])}>
                  {detailTask.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Assignee</p>
                <p className="mt-1 font-semibold text-sgvu-navy">
                  {detailTask.assignee ?? 'Unassigned'}
                </p>
              </div>
              {detailTask.remarks ? (
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Remarks</p>
                  <p className="mt-1 text-sgvu-navy">{detailTask.remarks}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" className={BRAND_BTN} onClick={() => setDetailTask(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Policy / Circular / Meeting */}
      <Dialog open={Boolean(createKind)} onOpenChange={(open) => !open && setCreateKind(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">
              {createKind ? CREATE_META[createKind].title : 'Create'}
            </DialogTitle>
            <DialogDescription>
              This adds a new row to the governance task register for follow-up and approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Title</span>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={createKind ? CREATE_META[createKind].placeholder : ''}
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
            {createKind === 'meeting' ? (
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold text-sgvu-navy">Council / type</span>
                <Select
                  value={createCouncil}
                  onChange={(e) =>
                    setCreateCouncil(
                      e.target.value as 'Meeting' | 'Academic Council' | 'Executive Council',
                    )
                  }
                  className="h-10 rounded-xl border-sgvu-navy/15"
                >
                  <option value="Meeting">Committee Meeting</option>
                  <option value="Academic Council">Academic Council</option>
                  <option value="Executive Council">Executive Council</option>
                </Select>
              </label>
            ) : null}
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Priority</span>
              <Select
                value={createPriority}
                onChange={(e) => setCreatePriority(e.target.value as GovernancePriority)}
                className="h-10 rounded-xl border-sgvu-navy/15"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </Select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">
                {createKind === 'meeting' ? 'Meeting date' : 'Due date'}
              </span>
              <Input
                type="date"
                value={createDue}
                onChange={(e) => setCreateDue(e.target.value)}
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Assigned by</span>
              <Input
                value={createAssignedBy}
                onChange={(e) => setCreateAssignedBy(e.target.value)}
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold text-sgvu-navy">Remarks</span>
              <Input
                value={createRemarks}
                onChange={(e) => setCreateRemarks(e.target.value)}
                placeholder="Optional notes"
                className="h-10 rounded-xl border-sgvu-navy/15"
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateKind(null)}>
              Cancel
            </Button>
            <Button type="button" className={BRAND_BTN} onClick={confirmCreate}>
              {createKind === 'meeting' ? 'Schedule' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Governance calendar */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">Governance calendar</DialogTitle>
            <DialogDescription>
              Upcoming meetings, deadlines, and scheduled governance activities.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {calendarItems.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-sgvu-navy/10 bg-sgvu-surface/40 px-3 py-3"
              >
                <p className="text-sm font-bold text-sgvu-navy">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.when}</p>
                <p className="mt-1 text-[11px] font-semibold text-sgvu-gold">{item.meta}</p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" className={BRAND_BTN} onClick={() => setCalendarOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GovernanceTasksSummaryCard() {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
            Governance
          </p>
          <h3 className="mt-1 text-lg font-bold text-sgvu-navy">Governance Tasks</h3>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Manage university governance approvals, committees, and policy workflows.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
              23 Pending
            </span>
            <span className="rounded-full bg-purple-50 px-2.5 py-1 font-semibold text-purple-800">
              3 Meetings
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
              8 Policies
            </span>
          </div>
        </div>
        <Button asChild className={cn(BRAND_BTN, 'rounded-lg')}>
          <Link href="/admin/tasks">Open governance module</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
