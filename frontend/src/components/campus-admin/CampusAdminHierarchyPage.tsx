'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type CampusRow = {
  campus_id: number;
  campus_name: string;
  campus_code?: string | null;
  address?: string | null;
};
type SchoolRow = {
  school_id: number;
  school_name: string;
  school_code?: string | null;
  campus_id: number;
  dean_user_id?: string | null;
  dean_name?: string | null;
  dean_email?: string | null;
};
type DepartmentRow = {
  dept_id: number;
  dept_name: string;
  description?: string | null;
  school_id: number;
  school_name?: string | null;
  hod_user_id?: string | null;
  hod_name?: string | null;
  hod_email?: string | null;
};
type ProgramRow = {
  program_id: number;
  program_name: string;
  program_code?: string | null;
  duration_years?: number | null;
  school_id?: number | null;
  dept_id?: number | null;
};
type BatchRow = {
  batch_id: number;
  batch_name: string;
  program_id: number;
  academic_year?: string | null;
  current_semester?: number | null;
};
type HierarchyPayload = {
  campuses: CampusRow[];
  schools: SchoolRow[];
  departments: DepartmentRow[];
  programs: ProgramRow[];
  batches: BatchRow[];
};
type AssignableUser = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
};
type Assignment = {
  assignment_id: string;
  assignment_type: string;
  entity_type: string;
  entity_id: string;
  user_name: string;
};
type NodeType = 'campus' | 'school' | 'department' | 'program' | 'batch';
type TreeNode = {
  key: string;
  type: NodeType;
  name: string;
  countLabel?: string;
  children: TreeNode[];
};

const TYPE_LABEL: Record<NodeType, string> = {
  campus: 'Campus',
  school: 'School',
  department: 'Department',
  program: 'Program',
  batch: 'Batch',
};

const TYPE_DOT: Record<NodeType, string> = {
  campus: 'bg-sgvu-navy',
  school: 'bg-sgvu-navy/70',
  department: 'bg-sgvu-gold',
  program: 'bg-slate-400',
  batch: 'bg-slate-300',
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function collectExpandableKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = [];
  const visit = (node: TreeNode) => {
    if (node.children.length) {
      keys.push(node.key);
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return keys;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty = value == null || value === '';
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm', empty ? 'text-muted-foreground' : 'font-medium text-sgvu-navy')}>
        {empty ? '—' : value}
      </span>
    </div>
  );
}

export function CampusAdminHierarchyPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<HierarchyPayload | null>(null);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const [tree, assignableResult, current] = await Promise.all([
          api.get<HierarchyPayload>('/api/campus-admin/hierarchy'),
          api.get<AssignableUser[]>('/api/campus-admin/hierarchy/assignable-users').catch(() => []),
          api.get<Assignment[]>('/api/campus-admin/hierarchy/assignments').catch(() => []),
        ]);
        let people = asArray<AssignableUser>(assignableResult);
        if (!people.length) {
          const staff = await api.get<Array<AssignableUser>>('/api/campus-admin/faculty-staff').catch(() => []);
          people = asArray<AssignableUser>(staff).filter((row) =>
            ['faculty', 'hod', 'dean'].includes(String(row.role_name ?? '').toLowerCase()),
          );
        }
        setData(tree);
        setUsers(people);
        setAssignments(asArray<Assignment>(current));
        if (!selectedKey && tree.campuses[0]) {
          setSelectedKey(`campus:${tree.campuses[0].campus_id}`);
        }
      } catch (err: unknown) {
        if (!silent) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Unable to load campus hierarchy.');
        } else {
          toast.error(err instanceof Error ? err.message : 'Could not refresh hierarchy');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api, selectedKey],
  );

  useEffect(() => {
    void load(false);
    // Initial load only; later refreshes call load(true) after actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const campus = data?.campuses[0];
  const schools = data?.schools ?? [];
  const departments = data?.departments ?? [];
  const programs = data?.programs ?? [];
  const batches = data?.batches ?? [];

  const tree = useMemo(() => {
    if (!data) return [];
    const visibleSchools = schoolFilter
      ? schools.filter((row) => String(row.school_id) === schoolFilter)
      : schools;

    return data.campuses.map((campusRow) => {
      const campusSchools = visibleSchools.filter(
        (row) => Number(row.campus_id) === Number(campusRow.campus_id),
      );
      return {
        key: `campus:${campusRow.campus_id}`,
        type: 'campus' as const,
        name: campusRow.campus_name,
        countLabel: `${campusSchools.length} schools`,
        children: campusSchools.map((school) => {
          const schoolDepts = departments.filter(
            (row) => Number(row.school_id) === Number(school.school_id),
          );
          const schoolPrograms = programs.filter(
            (row) =>
              Number(row.school_id) === Number(school.school_id) &&
              (row.dept_id == null ||
                !schoolDepts.some((dept) => Number(dept.dept_id) === Number(row.dept_id))),
          );
          return {
            key: `school:${school.school_id}`,
            type: 'school' as const,
            name: school.school_name,
            countLabel: `${schoolDepts.length} departments`,
            children: [
              ...schoolDepts.map((dept) => {
                const deptPrograms = programs.filter(
                  (row) => Number(row.dept_id) === Number(dept.dept_id),
                );
                return {
                  key: `department:${dept.dept_id}`,
                  type: 'department' as const,
                  name: dept.dept_name,
                  countLabel: `${deptPrograms.length} programs`,
                  children: deptPrograms.map((program) => {
                    const programBatches = batches.filter(
                      (row) => Number(row.program_id) === Number(program.program_id),
                    );
                    return {
                      key: `program:${program.program_id}`,
                      type: 'program' as const,
                      name: program.program_name,
                      countLabel: `${programBatches.length} batches`,
                      children: programBatches.map((batch) => ({
                        key: `batch:${batch.batch_id}`,
                        type: 'batch' as const,
                        name: batch.batch_name,
                        countLabel: batch.academic_year || undefined,
                        children: [],
                      })),
                    };
                  }),
                };
              }),
              ...schoolPrograms.map((program) => {
                const programBatches = batches.filter(
                  (row) => Number(row.program_id) === Number(program.program_id),
                );
                return {
                  key: `program:${program.program_id}`,
                  type: 'program' as const,
                  name: program.program_name,
                  countLabel: `${programBatches.length} batches`,
                  children: programBatches.map((batch) => ({
                    key: `batch:${batch.batch_id}`,
                    type: 'batch' as const,
                    name: batch.batch_name,
                    countLabel: batch.academic_year || undefined,
                    children: [],
                  })),
                };
              }),
            ],
          };
        }),
      };
    });
  }, [batches, data, departments, programs, schoolFilter, schools]);

  const matchKeys = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = new Set<string>();
    if (!needle) return matches;
    const visit = (node: TreeNode, ancestors: string[]) => {
      if (node.name.toLowerCase().includes(needle)) {
        matches.add(node.key);
        ancestors.forEach((key) => matches.add(key));
      }
      node.children.forEach((child) => visit(child, [...ancestors, node.key]));
    };
    tree.forEach((node) => visit(node, []));
    return matches;
  }, [query, tree]);

  useEffect(() => {
    if (!query.trim() || !tree.length) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      matchKeys.forEach((key) => next.add(key));
      return next;
    });
  }, [matchKeys, query, tree.length]);

  useEffect(() => {
    if (!tree.length) return;
    setExpanded((prev) => {
      if (prev.size) return prev;
      return new Set(collectExpandableKeys(tree).slice(0, 1 + schools.length));
    });
  }, [schools.length, tree]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const [type, id] = selectedKey.split(':') as [NodeType, string];
    if (type === 'campus') return { type, campus: data?.campuses.find((row) => String(row.campus_id) === id) };
    if (type === 'school') return { type, school: schools.find((row) => String(row.school_id) === id) };
    if (type === 'department') return { type, department: departments.find((row) => String(row.dept_id) === id) };
    if (type === 'program') return { type, program: programs.find((row) => String(row.program_id) === id) };
    return { type, batch: batches.find((row) => String(row.batch_id) === id) };
  }, [batches, data, departments, programs, schools, selectedKey]);

  useEffect(() => {
    setAssigneeId('');
  }, [selectedKey]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function assignmentFor(type: 'SCHOOL' | 'DEPARTMENT', id: string) {
    return assignments.find(
      (row) => row.entity_type.toUpperCase() === type && String(row.entity_id) === id,
    );
  }

  async function assign(type: 'DEAN' | 'HOD', entityType: 'SCHOOL' | 'DEPARTMENT', entityId: string) {
    if (!assigneeId) {
      toast.error('Select a person first, then click the button');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/campus-admin/hierarchy/assignments', {
        user_id: assigneeId,
        assignment_type: type,
        entity_type: entityType,
        entity_id: entityId,
      });
      toast.success(type === 'DEAN' ? 'Dean assigned' : 'HOD assigned');
      setAssigneeId('');
      await load(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  }

  async function revoke(assignmentId: string) {
    setSaving(true);
    try {
      await api.del(`/api/campus-admin/hierarchy/assignments/${assignmentId}`);
      toast.success('Assignment removed');
      await load(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not remove assignment');
    } finally {
      setSaving(false);
    }
  }

  function visible(node: TreeNode): boolean {
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    if (node.name.toLowerCase().includes(needle)) return true;
    return node.children.some(visible);
  }

  function renderNode(node: TreeNode, depth = 0): ReactNode {
    if (!visible(node)) return null;
    const isOpen = expanded.has(node.key);
    const hasChildren = node.children.length > 0;
    const isMatch = query.trim() !== '' && node.name.toLowerCase().includes(query.trim().toLowerCase());
    const isSelected = selectedKey === node.key;
    return (
      <li key={node.key}>
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg py-2 pr-3 transition-colors',
            isSelected && 'bg-sgvu-navy/[0.07]',
            isMatch && !isSelected && 'bg-sgvu-gold/10',
            !isSelected && !isMatch && 'hover:bg-slate-50',
          )}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/80 disabled:invisible"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            disabled={!hasChildren}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggle(node.key);
            }}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            )}
          </button>

          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            onClick={() => setSelectedKey(node.key)}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', TYPE_DOT[node.type])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-sgvu-navy">{node.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {TYPE_LABEL[node.type]}
                {node.countLabel ? ` · ${node.countLabel}` : ''}
              </span>
            </span>
          </button>
        </div>

        {hasChildren && isOpen ? (
          <ul className="m-0 list-none p-0">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Hierarchy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Campus → School → Department → Program. Use the arrow to open a branch; click a name for details.
          </p>
          {campus ? (
            <p className="mt-3 text-sm font-medium text-sgvu-navy">
              {campus.campus_name}
              {campus.campus_code ? ` · ${campus.campus_code}` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {loading ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading campus hierarchy…
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/20 bg-white shadow-sm">
          <CardContent className="space-y-4 py-8">
            <p className="text-sm text-destructive">Unable to load campus hierarchy.</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load(false)}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !campus ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No academic hierarchy found for this campus.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Schools" value={schools.length} icon={Landmark} />
            <SummaryCard title="Departments" value={departments.length} icon={Building2} />
            <SummaryCard title="Programs" value={programs.length} icon={BookOpen} />
            <SummaryCard title="Batches" value={batches.length} icon={GraduationCap} />
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name…"
                className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
              />
            </div>
            <select
              className="h-10 rounded-xl border border-sgvu-navy/15 bg-white px-3 text-sm lg:w-56"
              value={schoolFilter}
              onChange={(event) => setSchoolFilter(event.target.value)}
            >
              <option value="">All schools</option>
              {schools.map((row) => (
                <option key={row.school_id} value={String(row.school_id)}>
                  {row.school_name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setExpanded(new Set(collectExpandableKeys(tree)))}
              >
                Expand all
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setExpanded(new Set(tree.map((node) => node.key)))}
              >
                Collapse all
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.9fr)]">
            <Card className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader className="space-y-3 border-b border-sgvu-navy/5 pb-4">
                <div>
                  <CardTitle className="text-base text-sgvu-navy">Academic Hierarchy</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    One row per item. Indentation shows the level.
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {(Object.keys(TYPE_LABEL) as NodeType[]).map((type) => (
                    <span key={type} className="inline-flex items-center gap-1.5">
                      <span className={cn('h-1.5 w-1.5 rounded-full', TYPE_DOT[type])} />
                      {TYPE_LABEL[type]}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="max-h-[70vh] overflow-y-auto p-2">
                {tree.every((node) => !visible(node)) ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No matching hierarchy nodes.
                  </p>
                ) : (
                  <ul className="m-0 list-none space-y-0.5 p-0">
                    {tree.map((node) => renderNode(node))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="h-fit border-sgvu-navy/10 bg-white shadow-sm lg:sticky lg:top-4">
              <CardHeader className="border-b border-sgvu-navy/5 pb-4">
                <CardTitle className="text-base text-sgvu-navy">Details</CardTitle>
                <p className="text-sm text-muted-foreground">Selected item from the hierarchy.</p>
              </CardHeader>
              <CardContent className="pt-5">
                {!selected ? (
                  <p className="text-sm text-muted-foreground">Select an item in the tree.</p>
                ) : selected.type === 'campus' && selected.campus ? (
                  <div>
                    <h2 className="text-lg font-semibold text-sgvu-navy">{selected.campus.campus_name}</h2>
                    <Badge variant="outline" className="mt-2">Campus</Badge>
                    <div className="mt-4 divide-y">
                      <Field label="Campus Code" value={selected.campus.campus_code} />
                      <Field label="Address" value={selected.campus.address} />
                      <Field label="Schools" value={String(schools.length)} />
                    </div>
                  </div>
                ) : selected.type === 'school' && selected.school ? (
                  <div>
                    <h2 className="text-lg font-semibold text-sgvu-navy">{selected.school.school_name}</h2>
                    <Badge variant="outline" className="mt-2">School</Badge>
                    <div className="mt-4 divide-y">
                      <Field label="School Code" value={selected.school.school_code} />
                      <Field label="Campus" value={campus.campus_name} />
                      <Field label="Dean" value={selected.school.dean_name} />
                      <Field
                        label="Departments"
                        value={String(
                          departments.filter((row) => Number(row.school_id) === Number(selected.school?.school_id)).length,
                        )}
                      />
                    </div>
                    <AssignmentForm
                      label="Assign Dean"
                      users={users}
                      assigneeId={assigneeId}
                      setAssigneeId={setAssigneeId}
                      saving={saving}
                      currentName={selected.school.dean_name}
                      assignment={assignmentFor('SCHOOL', String(selected.school.school_id))}
                      onAssign={() => void assign('DEAN', 'SCHOOL', String(selected.school?.school_id))}
                      onRevoke={(id) => void revoke(id)}
                    />
                  </div>
                ) : selected.type === 'department' && selected.department ? (
                  <div>
                    <h2 className="text-lg font-semibold text-sgvu-navy">{selected.department.dept_name}</h2>
                    <Badge variant="outline" className="mt-2">Department</Badge>
                    <div className="mt-4 divide-y">
                      <Field label="School" value={selected.department.school_name} />
                      <Field label="HOD" value={selected.department.hod_name} />
                      <Field
                        label="Programs"
                        value={String(
                          programs.filter((row) => Number(row.dept_id) === Number(selected.department?.dept_id)).length,
                        )}
                      />
                    </div>
                    <AssignmentForm
                      label="Assign HOD"
                      users={users}
                      assigneeId={assigneeId}
                      setAssigneeId={setAssigneeId}
                      saving={saving}
                      currentName={selected.department.hod_name}
                      assignment={assignmentFor('DEPARTMENT', String(selected.department.dept_id))}
                      onAssign={() => void assign('HOD', 'DEPARTMENT', String(selected.department?.dept_id))}
                      onRevoke={(id) => void revoke(id)}
                    />
                  </div>
                ) : selected.type === 'program' && selected.program ? (
                  <div>
                    <h2 className="text-lg font-semibold text-sgvu-navy">{selected.program.program_name}</h2>
                    <Badge variant="outline" className="mt-2">Program</Badge>
                    <div className="mt-4 divide-y">
                      <Field label="Program Code" value={selected.program.program_code} />
                      <Field
                        label="Department"
                        value={
                          departments.find((row) => Number(row.dept_id) === Number(selected.program?.dept_id))
                            ?.dept_name
                        }
                      />
                      <Field
                        label="Duration"
                        value={
                          selected.program.duration_years
                            ? `${selected.program.duration_years} years`
                            : null
                        }
                      />
                      <Field
                        label="Batches"
                        value={String(
                          batches.filter((row) => Number(row.program_id) === Number(selected.program?.program_id)).length,
                        )}
                      />
                    </div>
                  </div>
                ) : selected.type === 'batch' && selected.batch ? (
                  <div>
                    <h2 className="text-lg font-semibold text-sgvu-navy">{selected.batch.batch_name}</h2>
                    <Badge variant="outline" className="mt-2">Batch</Badge>
                    <div className="mt-4 divide-y">
                      <Field
                        label="Program"
                        value={
                          programs.find((row) => Number(row.program_id) === Number(selected.batch?.program_id))
                            ?.program_name
                        }
                      />
                      <Field label="Academic Year" value={selected.batch.academic_year} />
                      <Field
                        label="Semester"
                        value={
                          selected.batch.current_semester != null
                            ? String(selected.batch.current_semester)
                            : null
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This record is not available.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: typeof Landmark;
}) {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-sgvu-navy">
            {value.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-xl bg-sgvu-navy/5 p-2.5 text-sgvu-navy">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentForm({
  label,
  users,
  assigneeId,
  setAssigneeId,
  saving,
  currentName,
  assignment,
  onAssign,
  onRevoke,
}: {
  label: string;
  users: AssignableUser[];
  assigneeId: string;
  setAssigneeId: (value: string) => void;
  saving: boolean;
  currentName?: string | null;
  assignment?: Assignment;
  onAssign: () => void;
  onRevoke: (assignmentId: string) => void;
}) {
  const actionLabel = assignment || currentName ? `Save ${label.replace('Assign ', '')}` : label;
  return (
    <div className="mt-5 space-y-3 rounded-xl border border-sgvu-navy/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-sgvu-navy">
        <Users className="h-4 w-4" />
        {label}
      </p>
      {currentName ? (
        <p className="text-sm text-muted-foreground">Current: {currentName}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No one assigned yet.</p>
      )}
      {users.length ? (
        <select
          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">Select a person from this campus…</option>
          {users.map((user) => (
            <option key={user.user_id} value={user.user_id}>
              {user.name} · {user.role_name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-amber-800">
          No faculty from this campus are available to assign.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Choose a person in the list, then click {actionLabel}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving || !assigneeId || !users.length} onClick={onAssign}>
          {saving ? 'Saving…' : actionLabel}
        </Button>
        {assignment ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => onRevoke(assignment.assignment_id)}
          >
            Remove assignment
          </Button>
        ) : null}
      </div>
    </div>
  );
}
