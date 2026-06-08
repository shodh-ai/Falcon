'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  Banknote,
  Building2,
  CalendarDays,
  Check,
  Eye,
  FileText,
  FolderLock,
  LayoutDashboard,
  Loader2,
  Pencil,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Timer,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrAvatar } from '@/components/hr/HrAvatar';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

const MODULES = [
  'ATTENDANCE',
  'LEAVES',
  'PAYROLL',
  'RECRUITMENT',
  'DOCUMENTS',
  'ONBOARDING',
  'OFFBOARDING',
  'DIRECTORY',
  'REPORTS',
  'BIOMETRICS',
  'POLICIES',
  'RULES',
  'DASHBOARD',
] as const;

const POWERS = ['can_view', 'can_edit', 'can_approve', 'can_delete'] as const;

const GROUP_ORDER = ['Employee', 'Time', 'Finance', 'Lifecycle', 'Admin'] as const;

const MODULE_META: Record<
  (typeof MODULES)[number],
  { label: string; description: string; icon: LucideIcon; group: (typeof GROUP_ORDER)[number] }
> = {
  DIRECTORY: { label: 'Directory', description: 'Employee roster & profiles', icon: Users, group: 'Employee' },
  ONBOARDING: { label: 'Onboarding', description: 'New hire pipeline', icon: UserPlus, group: 'Employee' },
  DOCUMENTS: { label: 'Documents', description: 'KYC vault & bulk export', icon: FolderLock, group: 'Employee' },
  RECRUITMENT: { label: 'Recruitment', description: 'ATS & hiring', icon: Users, group: 'Employee' },
  ATTENDANCE: { label: 'Attendance', description: 'Muster, OD & regularization', icon: Timer, group: 'Time' },
  BIOMETRICS: { label: 'Biometrics', description: 'Device sync & punches', icon: Timer, group: 'Time' },
  LEAVES: { label: 'Leaves', description: 'Balances & leave approvals', icon: CalendarDays, group: 'Time' },
  PAYROLL: { label: 'Payroll', description: 'Salary runs & payslips', icon: Banknote, group: 'Finance' },
  OFFBOARDING: { label: 'Offboarding', description: 'Exit & resignation clearance', icon: FileText, group: 'Lifecycle' },
  POLICIES: { label: 'Policies', description: 'Company policy CMS', icon: FileText, group: 'Admin' },
  RULES: { label: 'Rules', description: 'Attendance penalty engine', icon: Settings, group: 'Admin' },
  DASHBOARD: { label: 'Dashboard', description: 'HR overview widgets', icon: LayoutDashboard, group: 'Admin' },
  REPORTS: { label: 'Reports', description: 'Exports & analytics', icon: Archive, group: 'Admin' },
};

const POWER_META: Record<
  (typeof POWERS)[number],
  { label: string; short: string; icon: LucideIcon; active: string; idle: string; hint: string }
> = {
  can_view: {
    label: 'View',
    short: 'View',
    icon: Eye,
    active: 'border-sky-200 bg-sky-50 text-sky-800 shadow-sm',
    idle: 'border-gray-200 bg-white text-muted-foreground hover:border-sky-100 hover:bg-sky-50/50',
    hint: 'See module data & nav',
  },
  can_edit: {
    label: 'Edit',
    short: 'Edit',
    icon: Pencil,
    active: 'border-amber-200 bg-amber-50 text-amber-900 shadow-sm',
    idle: 'border-gray-200 bg-white text-muted-foreground hover:border-amber-100 hover:bg-amber-50/50',
    hint: 'Create & update records',
  },
  can_approve: {
    label: 'Approve',
    short: 'Approve',
    icon: ShieldCheck,
    active: 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm',
    idle: 'border-gray-200 bg-white text-muted-foreground hover:border-emerald-100 hover:bg-emerald-50/50',
    hint: 'Sign off workflow steps',
  },
  can_delete: {
    label: 'Delete',
    short: 'Delete',
    icon: Trash2,
    active: 'border-rose-200 bg-rose-50 text-rose-800 shadow-sm',
    idle: 'border-gray-200 bg-white text-muted-foreground hover:border-rose-100 hover:bg-rose-50/50',
    hint: 'Remove records',
  },
};

type Control = {
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
  can_delete: boolean;
  department_scope: number[] | null;
};

type AccessUser = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  controls: Control[];
};

type Dept = { dept_id: number; dept_name: string };

function controlFor(user: AccessUser, module: string): Control {
  return (
    user.controls.find((c) => c.module_name === module) ?? {
      module_name: module,
      can_view: false,
      can_edit: false,
      can_approve: false,
      can_delete: false,
      department_scope: null,
    }
  );
}

function applyPowerCascade(current: Control, power: (typeof POWERS)[number], value: boolean): Control {
  const next = { ...current, [power]: value };
  if (value) {
    if (power === 'can_edit' || power === 'can_approve' || power === 'can_delete') next.can_view = true;
    if (power === 'can_delete') next.can_edit = true;
  } else if (power === 'can_view') {
    next.can_edit = false;
    next.can_approve = false;
    next.can_delete = false;
  } else if (power === 'can_edit') {
    next.can_delete = false;
  }
  return next;
}

function countPowers(user: AccessUser) {
  let modules = 0;
  let approve = 0;
  let scoped = 0;
  for (const mod of MODULES) {
    const c = controlFor(user, mod);
    const any = c.can_view || c.can_edit || c.can_approve || c.can_delete;
    if (any) modules += 1;
    if (c.can_approve) approve += 1;
    if (c.department_scope?.length) scoped += 1;
  }
  return { modules, approve, scoped };
}

function PowerChip({
  power,
  active,
  saving,
  onToggle,
}: {
  power: (typeof POWERS)[number];
  active: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  const meta = POWER_META[power];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      title={meta.hint}
      disabled={saving}
      onClick={onToggle}
      className={cn(
        'inline-flex min-w-[5.25rem] items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all',
        active ? meta.active : meta.idle,
        saving && 'opacity-60',
      )}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {meta.short}
      {active && !saving ? <Check className="h-3 w-3 opacity-70" /> : null}
    </button>
  );
}

export default function HrAccessControlPage() {
  const api = useHrApi();
  const { entityReady, loading: entityLoading, entities } = useHrEntity();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const selected = users.find((u) => u.user_id === selectedUserId) ?? users[0] ?? null;
  const stats = useMemo(() => (selected ? countPowers(selected) : null), [selected]);

  const groupedModules = useMemo(() => {
    const map = new Map<string, (typeof MODULES)[number][]>();
    for (const mod of MODULES) {
      const g = MODULE_META[mod].group;
      const list = map.get(g) ?? [];
      list.push(mod);
      map.set(g, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, modules: map.get(g)! }));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void api
      .get<{ roles: unknown[]; departments: Dept[] }>('/api/hr/metadata/roles-departments')
      .then((d) => setDepartments(d.departments))
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    if (entityLoading) return;
    setLoading(true);
    const path = debouncedQ
      ? `/api/hr/admin/permissions?q=${encodeURIComponent(debouncedQ)}&limit=100`
      : '/api/hr/admin/permissions?limit=100';
    void api
      .get<AccessUser[]>(path)
      .then((rows) => {
        setUsers(rows);
        setSelectedUserId((prev) => {
          if (prev && rows.some((r) => r.user_id === prev)) return prev;
          return rows[0]?.user_id ?? null;
        });
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [api, entityLoading, debouncedQ]);

  async function saveControl(userId: string, module: string, control: Control) {
    const cellKey = `${userId}:${module}`;
    setSaving(cellKey);
    try {
      await api.patch(`/api/hr/admin/permissions/${userId}`, {
        module,
        can_view: control.can_view,
        can_edit: control.can_edit,
        can_approve: control.can_approve,
        can_delete: control.can_delete,
        department_scope: control.department_scope,
      });
      setUsers((prev) =>
        prev.map((u) => {
          if (u.user_id !== userId) return u;
          const others = u.controls.filter((c) => c.module_name !== module);
          return { ...u, controls: [...others, { ...control, module_name: module }] };
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  async function togglePower(module: string, power: (typeof POWERS)[number]) {
    if (!selected) return;
    const current = controlFor(selected, module);
    const next = applyPowerCascade(current, power, !current[power]);
    await saveControl(selected.user_id, module, next);
  }

  async function setDepartmentScope(module: string, deptId: string) {
    if (!selected) return;
    const current = controlFor(selected, module);
    const scope = deptId ? [Number(deptId)] : null;
    await saveControl(selected.user_id, module, { ...current, department_scope: scope });
  }

  if (entityLoading || loading) {
    return <FalconLoader label="Loading access control matrix…" />;
  }

  if (!entityReady && entities.length === 0) {
    return (
      <>
        <HrPageHeader
          title="HR Access Control"
          description="Unified permissions for portal access, approvals, and department scope."
        />
        <HrEmptyState
          icon={Shield}
          title="No organization entity"
          description="Select an entity from the header switcher or contact your Super Admin."
        />
      </>
    );
  }

  return (
    <>
      <HrPageHeader
        title="HR Access Control"
        description="One matrix for everything: View opens modules, Edit changes data, Approve powers workflow steps, Delete removes records. Department scope limits visibility."
      />

      {!users.length ? (
        <HrEmptyState
          icon={Users}
          title="No staff found"
          description="Try a different search term."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,300px)_1fr]">
          <aside className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50/90 to-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Staff members
              </p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="border-gray-200 bg-white pl-9 shadow-sm"
                  placeholder="Search name or email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <ul className="max-h-[min(70vh,560px)] flex-1 overflow-y-auto p-2">
              {users.map((u) => {
                const active = u.user_id === selected?.user_id;
                const { modules, approve } = countPowers(u);
                return (
                  <li key={u.user_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(u.user_id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                        active ? 'bg-sgvu-navy/5 ring-1 ring-sgvu-gold/40' : 'hover:bg-muted/50',
                      )}
                    >
                      <HrAvatar name={u.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-sgvu-navy">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {u.role}
                          </Badge>
                          {modules > 0 && (
                            <Badge className="bg-sgvu-gold/15 text-[10px] text-amber-900 hover:bg-sgvu-gold/15">
                              {modules} modules
                            </Badge>
                          )}
                          {approve > 0 && (
                            <Badge className="bg-emerald-100 text-[10px] text-emerald-800 hover:bg-emerald-100">
                              {approve} approve
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="space-y-5">
            {selected && (
              <>
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gradient-to-r from-sgvu-navy/[0.03] to-white p-5 shadow-sm">
                  <HrAvatar name={selected.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-sgvu-navy">{selected.name}</h2>
                    <p className="text-sm text-muted-foreground">{selected.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">{selected.role}</Badge>
                      {selected.department && (
                        <Badge variant="outline" className="gap-1">
                          <Building2 className="h-3 w-3" />
                          {selected.department}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {stats && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <HrStatCard
                      label="Modules enabled"
                      value={stats.modules}
                      sub="At least one power on"
                      icon={Shield}
                      accent="navy"
                    />
                    <HrStatCard
                      label="Approve powers"
                      value={stats.approve}
                      sub="Workflow sign-off rights"
                      icon={ShieldCheck}
                      accent="gold"
                    />
                    <HrStatCard
                      label="Dept-scoped"
                      value={stats.scoped}
                      sub="Limited to one department"
                      icon={Building2}
                    />
                  </div>
                )}

                <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3 text-xs text-sky-900">
                  <strong>How it maps:</strong> View + Edit drive portal navigation &amp; API guards.
                  Approve routes this person into maker-checker workflows. Scope hides other departments
                  from their directory &amp; inbox.
                </div>

                {groupedModules.map(({ group, modules }) => (
                  <section key={group} className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {modules.map((mod) => {
                        const meta = MODULE_META[mod];
                        const Icon = meta.icon;
                        const c = controlFor(selected, mod);
                        const cellKey = `${selected.user_id}:${mod}`;
                        const isSaving = saving === cellKey;
                        const hasAny =
                          c.can_view || c.can_edit || c.can_approve || c.can_delete;

                        return (
                          <article
                            key={mod}
                            className={cn(
                              'flex flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
                              hasAny ? 'border-sgvu-gold/30 ring-1 ring-sgvu-gold/10' : 'border-gray-100',
                            )}
                          >
                            <div className="mb-3 flex items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sgvu-navy/5 text-sgvu-navy">
                                <Icon className="h-5 w-5" />
                              </span>
                              <div>
                                <h4 className="font-bold text-sgvu-navy">{meta.label}</h4>
                                <p className="text-xs text-muted-foreground">{meta.description}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {POWERS.map((power) => (
                                <PowerChip
                                  key={power}
                                  power={power}
                                  active={c[power]}
                                  saving={isSaving}
                                  onToggle={() => void togglePower(mod, power)}
                                />
                              ))}
                            </div>

                            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <select
                                className="w-full rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-1.5 text-xs font-medium text-sgvu-navy focus:border-sgvu-gold focus:outline-none focus:ring-1 focus:ring-sgvu-gold/30"
                                value={c.department_scope?.[0]?.toString() ?? ''}
                                disabled={isSaving}
                                onChange={(e) => void setDepartmentScope(mod, e.target.value)}
                              >
                                <option value="">All departments</option>
                                {departments.map((d) => (
                                  <option key={d.dept_id} value={d.dept_id}>
                                    {d.dept_name} only
                                  </option>
                                ))}
                              </select>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
