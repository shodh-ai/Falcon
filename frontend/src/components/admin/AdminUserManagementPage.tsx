'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Plus, RefreshCw, Search } from 'lucide-react';
import { REG_BRAND_BTN, REG_OUTLINE_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type UserRow = {
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  dept_id?: number | null;
  dept_name?: string | null;
  role_name?: string | null;
  onboarding_status?: string | null;
  account_status?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DepartmentRow = {
  dept_id: number;
  dept_name: string;
};

type UsersResponse = {
  items: UserRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type RoleOption = { role_id: number; role_name: string };
type DepartmentOption = { dept_id: number; dept_name: string };
type RolesResponse = { roles: RoleOption[] };

type UserFormState = {
  name: string;
  email: string;
  role_name: string;
  dept_id: string;
  is_active: boolean;
  temporary_password: string;
};

const EMPTY_FORM: UserFormState = {
  name: '',
  email: '',
  role_name: '',
  dept_id: '',
  is_active: true,
  temporary_password: '',
};

function statusBadge(row: UserRow) {
  if (row.is_active) {
    return (
      <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
      {row.account_status === 'SUSPENDED' ? 'Suspended' : 'Inactive'}
    </Badge>
  );
}

export function AdminUserManagementPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);

  const roleOptions = useMemo(
    () => [...new Set(roles.map((role) => role.role_name).filter(Boolean))].sort(),
    [roles],
  );

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));
      const data = await api.get<UsersResponse>(`/api/admin-control/users?${params.toString()}`);
      setRows(data.items ?? []);
      setPage(data.page ?? 1);
      setLimit(data.limit ?? 20);
      setTotal(data.total ?? 0);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [api, limit, page, roleFilter, search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.get<RolesResponse>('/api/admin-control/roles'),
      api.get<DepartmentRow[]>('/api/admin-control/departments?status=all').catch(() => []),
    ]).then(([roleData, deptData]) => {
      if (cancelled) return;
      setRoles(roleData.roles ?? []);
      setDepartments(
        (deptData ?? []).sort((a, b) => a.dept_name.localeCompare(b.dept_name)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));
    void api
      .get<UsersResponse>(`/api/admin-control/users?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.items ?? []);
        setPage(data.page ?? 1);
        setLimit(data.limit ?? 20);
        setTotal(data.total ?? 0);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, limit, page, roleFilter, search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: UserRow) {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      email: row.email ?? '',
      role_name: row.role_name ?? '',
      dept_id: row.dept_id != null ? String(row.dept_id) : '',
      is_active: row.is_active,
      temporary_password: '',
    });
    setFormOpen(true);
  }

  async function submitForm() {
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role_name: form.role_name,
        dept_id: form.dept_id ? Number(form.dept_id) : undefined,
        is_active: form.is_active,
        ...(editing
          ? {}
          : form.temporary_password.trim()
            ? { temporary_password: form.temporary_password.trim() }
            : {}),
      };
      if (editing) {
        await api.patch(`/api/admin-control/users/${editing.user_id}`, payload);
        toast.success('User updated');
      } else {
        const created = await api.post<{ temporary_password?: string }>(
          '/api/admin-control/users',
          payload,
        );
        toast.success(
          created.temporary_password
            ? `User created. Temporary password: ${created.temporary_password}`
            : 'User created',
        );
      }
      setFormOpen(false);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save user');
    } finally {
      setSubmitting(false);
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    setSubmitting(true);
    try {
      await confirmAction.action();
      setConfirmAction(null);
      await loadUsers();
    } finally {
      setSubmitting(false);
    }
  }

  const offset = (page - 1) * limit;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sgvu-gold">
                Admin Control Center
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">
                User Management
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Manage admin-portal accounts, update roles, and activate or deactivate access
                using the existing Falcon admin APIs.
              </p>
            </div>
            <Button type="button" className={cn('h-11', REG_BRAND_BTN)} onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or email"
                className="h-11 pl-9"
              />
            </div>
            <Select
              value={roleFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setRoleFilter(e.target.value);
              }}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setStatusFilter(e.target.value as 'active' | 'inactive' | 'all');
              }}
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Button
              type="button"
              variant="outline"
              className={cn('h-11', REG_OUTLINE_BTN)}
              onClick={() => {
                setLoading(true);
                setPage(1);
                setSearch(searchInput);
              }}
            >
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users…
            </div>
          ) : error ? (
            <div className="space-y-4 px-6 py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void loadUsers();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="space-y-3 px-6 py-16 text-center">
              <p className="font-semibold text-sgvu-navy">No users found</p>
              <p className="text-sm text-muted-foreground">
                Adjust the filters or create the first admin workflow user.
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 md:p-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.user_id} className="border-sgvu-navy/5">
                      <TableCell>
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-left font-semibold text-sgvu-navy hover:underline"
                            onClick={() => setDetailsRow(row)}
                          >
                            {row.name}
                          </button>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-sgvu-navy/15 bg-slate-50 text-sgvu-navy">
                          {row.role_name || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{statusBadge(row)}</TableCell>
                      <TableCell>{row.dept_name || 'University-wide'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.last_login_at
                          ? new Date(row.last_login_at).toLocaleString('en-IN')
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailsRow(row)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              Edit user / assign role
                            </DropdownMenuItem>
                            {row.is_active ? (
                              <DropdownMenuItem
                                className="text-amber-700 focus:text-amber-700"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Deactivate user',
                                    description: `This will disable ${row.name}'s access until reactivated.`,
                                    action: async () => {
                                      await api.post(`/api/admin-control/users/${row.user_id}/deactivate`);
                                      toast.success('User deactivated');
                                    },
                                  })
                                }
                              >
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-emerald-700 focus:text-emerald-700"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Activate user',
                                    description: `This will restore ${row.name}'s access.`,
                                    action: async () => {
                                      await api.post(`/api/admin-control/users/${row.user_id}/activate`);
                                      toast.success('User activated');
                                    },
                                  })
                                }
                              >
                                Activate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <PaginationBar
                total={total}
                limit={limit}
                offset={offset}
                onPageChange={(nextOffset) => {
                  setLoading(true);
                  setPage(Math.floor(nextOffset / limit) + 1);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit user' : 'Create user'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update profile fields, assign a new role, or change account status.'
                : 'Create a new admin workflow user using the existing Admin Control API.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sgvu-navy">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sgvu-navy">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="user@mygyanvihar.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sgvu-navy">Role</label>
              <Select
                value={form.role_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, role_name: String(e.target.value) }))
                }
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">Select role</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sgvu-navy">Department</label>
              <Select
                value={form.dept_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dept_id: String(e.target.value) }))
                }
                className="h-11 rounded-xl border-sgvu-navy/15"
              >
                <option value="">University-wide</option>
                {departments.map((dept) => (
                  <option key={dept.dept_id} value={String(dept.dept_id)}>
                    {dept.dept_name}
                  </option>
                ))}
              </Select>
            </div>
            {!editing ? (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-sgvu-navy">
                  Temporary password
                </label>
                <Input
                  value={form.temporary_password}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, temporary_password: e.target.value }))
                  }
                  placeholder="Leave blank to auto-generate"
                />
              </div>
            ) : null}
            <label className="inline-flex items-center gap-2 text-sm font-medium text-sgvu-navy md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, is_active: e.target.checked }))
                }
              />
              Keep account active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(REG_BRAND_BTN)}
              disabled={
                submitting ||
                !form.name.trim() ||
                !form.email.trim() ||
                !form.role_name.trim()
              }
              onClick={() => void submitForm()}
            >
              {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsRow)} onOpenChange={(open) => !open && setDetailsRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User details</DialogTitle>
            <DialogDescription>
              Existing Admin Control user record details and current access state.
            </DialogDescription>
          </DialogHeader>
          {detailsRow ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-sgvu-navy">{detailsRow.name}</p>
                <p className="text-muted-foreground">{detailsRow.email}</p>
              </div>
              <div className="grid gap-3 rounded-xl border border-sgvu-navy/10 bg-slate-50/70 p-4 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Role: </span>
                  <span className="font-medium text-sgvu-navy">{detailsRow.role_name || '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium text-sgvu-navy">
                    {detailsRow.is_active ? 'Active' : detailsRow.account_status || 'Inactive'}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Department: </span>
                  <span className="font-medium text-sgvu-navy">
                    {detailsRow.dept_name || 'University-wide'}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Onboarding: </span>
                  <span className="font-medium text-sgvu-navy">
                    {detailsRow.onboarding_status || '—'}
                  </span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Last login: </span>
                  <span className="font-medium text-sgvu-navy">
                    {detailsRow.last_login_at
                      ? new Date(detailsRow.last_login_at).toLocaleString('en-IN')
                      : 'Never'}
                  </span>
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && !submitting && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={cn(REG_BRAND_BTN)}
              disabled={submitting}
              onClick={() => void runConfirmedAction()}
            >
              {submitting ? 'Working…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
