'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
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
  phone?: string | null;
  is_active: boolean;
  dept_id?: number | null;
  dept_name?: string | null;
  role_name?: string | null;
  account_status?: string | null;
  created_at?: string | null;
};

type DepartmentOption = { dept_id: number; dept_name: string };
type RoleOption = { role_id: number; role_name: string };

type UsersResponse = {
  items: UserRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type UserFormState = {
  name: string;
  email: string;
  phone: string;
  role_name: string;
  dept_id: string;
  is_active: boolean;
  temporary_password: string;
};

const EMPTY_FORM: UserFormState = {
  name: '',
  email: '',
  phone: '',
  role_name: '',
  dept_id: '',
  is_active: false,
  temporary_password: '',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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
      Inactive
    </Badge>
  );
}

export function CampusAdminUserManagementPage() {
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
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

  const roleOptions = useMemo(
    () => [...new Set(roles.map((role) => role.role_name).filter(Boolean))].sort(),
    [roles],
  );

  const loadUsers = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));
    const path = `/api/campus-admin/users?${params.toString()}`;

    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const data = await api.get<UsersResponse>(path);
        setRows(data.items ?? []);
        setTotal(data.total ?? 0);
        if (data.page != null && data.page !== page) setPage(data.page);
        if (data.limit != null && data.limit !== limit) setLimit(data.limit);
        setError(null);
        return;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const unreachable = message.includes('Cannot reach API');
        if (!unreachable || attempt === maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }

    // Keep existing rows on transient network failure so filters don't blank the table.
    setError(
      lastError instanceof Error ? lastError.message : 'Failed to load users',
    );
  }, [api, limit, page, roleFilter, search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.get<{ roles: RoleOption[] }>('/api/campus-admin/users/roles'),
      api.get<DepartmentOption[]>('/api/campus-admin/departments').catch(() => []),
    ])
      .then(([roleData, deptData]) => {
        if (cancelled) return;
        setRoles(roleData.roles ?? []);
        setDepartments(
          (Array.isArray(deptData) ? deptData : []).sort((a, b) =>
            a.dept_name.localeCompare(b.dept_name),
          ),
        );
      })
      .catch(() => {
        /* roles/depts optional for list; create form will show empty until retry */
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Debounce search so typing filters without an Apply button.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim();
      setPage(1);
      setSearch((prev) => (prev === next ? prev : next));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadUsers().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

  function applyFilters(next?: {
    role?: string;
    status?: 'active' | 'inactive' | 'all';
  }) {
    setLoading(true);
    setPage(1);
    setSearch(searchInput.trim());
    if (next?.role !== undefined) setRoleFilter(next.role);
    if (next?.status !== undefined) setStatusFilter(next.status);
  }

  function openCreate() {
    setEditing(null);
    setCreatedTempPassword(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: UserRow) {
    setEditing(row);
    setCreatedTempPassword(null);
    setForm({
      name: row.name ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      role_name: row.role_name ?? '',
      dept_id: row.dept_id != null ? String(row.dept_id) : '',
      is_active: row.is_active,
      temporary_password: '',
    });
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim() || !form.email.trim() || !form.role_name.trim() || !form.dept_id) {
      toast.error('Name, email, role, and department are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        role_name: form.role_name,
        dept_id: Number(form.dept_id),
        is_active: form.is_active,
        ...(editing
          ? {}
          : form.temporary_password.trim()
            ? { temporary_password: form.temporary_password.trim() }
            : {}),
      };
      if (editing) {
        await api.patch(`/api/campus-admin/users/${editing.user_id}`, payload);
        toast.success('User updated');
        setFormOpen(false);
      } else {
        const created = await api.post<{ temporary_password?: string }>(
          '/api/campus-admin/users',
          payload,
        );
        if (created.temporary_password) {
          setCreatedTempPassword(created.temporary_password);
          toast.success(
            form.is_active
              ? 'User created and activated'
              : 'User created as inactive. Activate when ready for login.',
          );
        } else {
          toast.success('User created');
          setFormOpen(false);
        }
      }
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  const offset = (page - 1) * limit;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">
              User Management
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Create campus users, assign role and department, then activate access for login.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or email"
                className="h-11 rounded-xl border-sgvu-navy/15 pl-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setSearch(searchInput.trim());
                    setPage(1);
                  }
                }}
              />
            </div>
            <Select
              value={roleFilter}
              onChange={(e) => applyFilters({ role: e.target.value })}
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
              onChange={(e) =>
                applyFilters({
                  status: e.target.value as 'active' | 'inactive' | 'all',
                })
              }
              className="h-11 rounded-xl border-sgvu-navy/15"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Button
              type="button"
              className="h-11 rounded-xl bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              onClick={openCreate}
            >
              Create User
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
          ) : error && rows.length === 0 ? (
            <div className="space-y-4 px-6 py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <p className="text-xs text-muted-foreground">
                Make sure the backend is running on port 4000, then retry.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void loadUsers().finally(() => setLoading(false));
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
                Adjust filters or create the first campus user.
              </p>
            </div>
          ) : (
            <div className="space-y-4 overflow-x-auto p-4 md:p-5">
              {error ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <span>{error}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setLoading(true);
                      void loadUsers().finally(() => setLoading(false));
                    }}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell className="font-semibold text-sgvu-navy">{row.name}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.role_name ?? '—'}</TableCell>
                      <TableCell>{row.dept_name ?? '—'}</TableCell>
                      <TableCell>{statusBadge(row)}</TableCell>
                      <TableCell>{formatDate(row.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="text-sm font-semibold text-sgvu-navy hover:underline"
                          onClick={() => setDetailsRow(row)}
                        >
                          View
                        </button>
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

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setCreatedTempPassword(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Manage user' : 'Create user'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update profile, role, department, and activation status for this campus.'
                : 'Create a campus user with an allowed role and department. Defaults to inactive until activated.'}
            </DialogDescription>
          </DialogHeader>

          {createdTempPassword ? (
            <div className="space-y-4 rounded-xl border border-sgvu-gold/30 bg-sgvu-gold/5 p-4">
              <p className="text-sm font-semibold text-sgvu-navy">User created successfully</p>
              <p className="text-sm text-muted-foreground">
                Share this one-time temporary password securely. It is not stored in plain text.
              </p>
              <code className="block rounded-lg bg-white px-3 py-2 font-mono text-sm text-sgvu-navy">
                {createdTempPassword}
              </code>
              <DialogFooter>
                <Button
                  type="button"
                  className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                  onClick={() => {
                    setFormOpen(false);
                    setCreatedTempPassword(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sgvu-navy">Name *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sgvu-navy">Email *</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sgvu-navy">Phone</label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sgvu-navy">User type / Role *</label>
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
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-sgvu-navy">Department *</label>
                  <Select
                    value={form.dept_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, dept_id: String(e.target.value) }))
                    }
                    className="h-11 rounded-xl border-sgvu-navy/15"
                  >
                    <option value="">Select department</option>
                    {departments.map((dept) => (
                      <option key={dept.dept_id} value={String(dept.dept_id)}>
                        {dept.dept_name}
                      </option>
                    ))}
                  </Select>
                </div>
                {!editing ? (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-sgvu-navy">Temporary password</label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={form.temporary_password}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, temporary_password: e.target.value }))
                      }
                      placeholder="Leave blank to auto-generate (min 8 if set)"
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
                  Active (can log in)
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                  disabled={submitting}
                  onClick={() => void submitForm()}
                >
                  {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsRow)} onOpenChange={(open) => !open && setDetailsRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detailsRow?.name}</DialogTitle>
            <DialogDescription>Campus user profile and access state.</DialogDescription>
          </DialogHeader>
          {detailsRow ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 p-3">
                <p>
                  <span className="text-muted-foreground">Email: </span>
                  {detailsRow.email}
                </p>
                <p className="mt-1.5">
                  <span className="text-muted-foreground">Phone: </span>
                  {detailsRow.phone || '—'}
                </p>
                <p className="mt-1.5">
                  <span className="text-muted-foreground">Role: </span>
                  {detailsRow.role_name || '—'}
                </p>
                <p className="mt-1.5">
                  <span className="text-muted-foreground">Department: </span>
                  {detailsRow.dept_name || '—'}
                </p>
                <p className="mt-1.5 flex items-center gap-2">
                  <span className="text-muted-foreground">Status: </span>
                  {statusBadge(detailsRow)}
                </p>
                <p className="mt-1.5">
                  <span className="text-muted-foreground">Created: </span>
                  {formatDate(detailsRow.created_at)}
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDetailsRow(null)}>
              Close
            </Button>
            {detailsRow ? (
              <>
                {detailsRow.is_active ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-200 text-amber-800 hover:bg-amber-50"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Deactivate user',
                        description: `This disables login for ${detailsRow.name}. Historical records are kept.`,
                        action: async () => {
                          await api.post(
                            `/api/campus-admin/users/${detailsRow.user_id}/deactivate`,
                          );
                          toast.success('User deactivated');
                          setDetailsRow((prev) =>
                            prev ? { ...prev, is_active: false } : null,
                          );
                        },
                      })
                    }
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Activate user',
                        description: `This restores login access for ${detailsRow.name}.`,
                        action: async () => {
                          await api.post(
                            `/api/campus-admin/users/${detailsRow.user_id}/activate`,
                          );
                          toast.success('User activated');
                          setDetailsRow((prev) =>
                            prev ? { ...prev, is_active: true } : null,
                          );
                        },
                      })
                    }
                  >
                    Activate
                  </Button>
                )}
                <Button
                  type="button"
                  className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
                  onClick={() => {
                    openEdit(detailsRow);
                    setDetailsRow(null);
                  }}
                >
                  Edit
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={cn('bg-sgvu-navy text-white hover:bg-sgvu-navy/90')}
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
