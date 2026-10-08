'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, GraduationCap, Layers, Loader2, School, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Hierarchy = {
  campuses: { campus_id: number; campus_name: string }[];
  schools: { school_id: number; school_name: string; campus_id: number }[];
  departments: {
    dept_id: number;
    dept_name: string;
    school_id?: number | null;
    school_ids?: number[];
  }[];
  programs: { program_id: number; program_name: string; school_id: number }[];
  batches: { batch_id: string; batch_name: string }[];
};

type Assignment = {
  assignment_id: string;
  user_name: string;
  official_email: string;
  assignment_type: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
};

const TREE_SECTIONS = [
  { key: 'campuses', title: 'Campuses', icon: Building2 },
  { key: 'schools', title: 'Schools', icon: School },
  { key: 'departments', title: 'Departments', icon: Layers },
  { key: 'programs', title: 'Programs', icon: GraduationCap },
  { key: 'batches', title: 'Batches', icon: Users },
] as const;

function hierarchyItemLabel(
  key: (typeof TREE_SECTIONS)[number]['key'],
  item: Record<string, unknown>,
) {
  if (key === 'campuses') return String(item.campus_name ?? `Campus #${item.campus_id}`);
  if (key === 'schools') return String(item.school_name ?? `School #${item.school_id}`);
  if (key === 'departments') return String(item.dept_name ?? `Department #${item.dept_id}`);
  if (key === 'programs') return String(item.program_name ?? `Program #${item.program_id}`);
  if (key === 'batches') return String(item.batch_name ?? `Batch #${item.batch_id}`);
  return String(
    Object.values(item).find((v) => typeof v === 'string' && !/^\d+$/.test(v)) ??
      JSON.stringify(item),
  );
}

function HierarchyListCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Building2;
  items: string[];
}) {
  return (
    <Card className="flex h-full flex-col border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex items-center justify-between gap-3 border-b border-sgvu-navy/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-gold">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-sgvu-navy">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {items.length} configured
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-sgvu-navy/15 bg-slate-50 font-semibold text-sgvu-navy"
          >
            {items.length}
          </Badge>
        </div>

        <div className="max-h-56 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="flex h-full min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-sgvu-navy/15 bg-slate-50/70 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">None configured</p>
            </div>
          ) : (
            items.map((label, index) => (
              <div
                key={`${title}-${index}-${label}`}
                className="rounded-lg border border-sgvu-navy/10 bg-white px-3 py-2.5 text-sm font-medium text-sgvu-navy/90 shadow-sm"
              >
                {label}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminIamReadOnly() {
  const api = useAuthedApi();
  const [tree, setTree] = useState<Hierarchy | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [campuses, setCampuses] = useState<{ campus_id: number; campus_name: string }[]>([]);
  const [schools, setSchools] = useState<{ school_id: number; school_name: string }[]>([]);
  const [programs, setPrograms] = useState<{ program_id: number; program_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      api.get<Hierarchy>('/api/super-admin/hierarchy').catch(() => null),
      api.get<Assignment[]>('/api/super-admin/assignments').catch(() => []),
      api.get<{ campus_id: number; campus_name: string }[]>('/iam/campuses').catch(() => []),
      api.get<{ school_id: number; school_name: string }[]>('/iam/schools').catch(() => []),
      api.get<{ program_id: number; program_name: string }[]>('/iam/programs').catch(() => []),
    ])
      .then(([hierarchy, rows, c, s, p]) => {
        if (cancelled) return;
        setTree(hierarchy);
        setAssignments(rows ?? []);
        setCampuses(c ?? []);
        setSchools(s ?? []);
        setPrograms(p ?? []);
        if (!hierarchy && !c?.length) {
          setError('Unable to load hierarchy. Contact campus IT if this persists.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const schoolNameById = useMemo(
    () => new Map((tree?.schools ?? schools).map((s) => [String(s.school_id), s.school_name])),
    [tree?.schools, schools],
  );

  const sections = useMemo(() => {
    if (tree) {
      return TREE_SECTIONS.map((section) => ({
        ...section,
        items: (tree[section.key] as Record<string, unknown>[]).map((item) =>
          hierarchyItemLabel(section.key, item),
        ),
      }));
    }
    return [
      {
        key: 'campuses' as const,
        title: 'Campuses',
        icon: Building2,
        items: campuses.map((r) => r.campus_name),
      },
      {
        key: 'schools' as const,
        title: 'Schools',
        icon: School,
        items: schools.map((r) => r.school_name),
      },
      {
        key: 'departments' as const,
        title: 'Departments',
        icon: Layers,
        items: [] as string[],
      },
      {
        key: 'programs' as const,
        title: 'Programs',
        icon: GraduationCap,
        items: programs.map((r) => r.program_name),
      },
      {
        key: 'batches' as const,
        title: 'Batches',
        icon: Users,
        items: [] as string[],
      },
    ];
  }, [tree, campuses, schools, programs]);

  const totals = useMemo(
    () => ({
      entities: sections.reduce((sum, s) => sum + s.items.length, 0),
      assignments: assignments.length,
      schools: sections.find((s) => s.key === 'schools')?.items.length ?? 0,
      departments: sections.find((s) => s.key === 'departments')?.items.length ?? 0,
    }),
    [sections, assignments.length],
  );

  function assignmentLabel(row: Assignment) {
    if (row.entity_name?.trim()) return row.entity_name;
    if (row.entity_type?.toUpperCase() === 'SCHOOL') {
      return schoolNameById.get(String(row.entity_id)) ?? `School #${row.entity_id}`;
    }
    return `${row.entity_type} #${row.entity_id}`;
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-7xl items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading IAM & hierarchy…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
              Identity & Access
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
              IAM & Hierarchy
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Read-only view of campuses, schools, programs, and dean/HOD assignments.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total entities', value: totals.entities },
              { label: 'Schools', value: totals.schools },
              { label: 'Departments', value: totals.departments },
              { label: 'Assignments', value: totals.assignments },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 px-4 py-3"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-sgvu-navy">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="border-b border-sgvu-navy/10 px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sgvu-gold">
              Leadership map
            </p>
            <h2 className="mt-1 text-lg font-semibold text-sgvu-navy">Dean & HOD assignments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {assignments.length} active assignment{assignments.length === 1 ? '' : 's'}
            </p>
          </div>

          {assignments.length === 0 ? (
            <div className="px-5 py-12">
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-sgvu-navy/20 bg-slate-50/70 px-6 py-8 text-center">
                <p className="font-semibold text-sgvu-navy">No assignments recorded</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Dean and HOD mappings will appear here once Super Admin assigns them.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-slate-50/90 pl-5">Leader</TableHead>
                  <TableHead className="bg-slate-50/90">Role</TableHead>
                  <TableHead className="bg-slate-50/90">Entity</TableHead>
                  <TableHead className="bg-slate-50/90 pr-5">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((row) => (
                  <TableRow key={row.assignment_id} className="border-sgvu-navy/5">
                    <TableCell className="pl-5 font-semibold text-sgvu-navy">
                      {row.user_name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'border-transparent font-medium',
                          row.assignment_type.toUpperCase().includes('DEAN')
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800',
                        )}
                      >
                        {row.assignment_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sgvu-navy/85">{assignmentLabel(row)}</TableCell>
                    <TableCell className="pr-5 text-muted-foreground">
                      {row.official_email || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
