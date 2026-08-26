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

type PermissionMap = {
  read?: string[];
  create?: string[];
  edit?: string[];
  update?: string[];
  delete?: string[];
  approve?: string[];
  view?: string[];
};

type RoleRow = {
  role_id: number;
  role_name: string;
  user_count: number;
  source: string;
  can_manage: boolean;
  permissions: PermissionMap;
};

type RolesResponse = {
  roles: RoleRow[];
  actions: string[];
  resources: string[];
  hierarchy?: string[];
  note?: string;
};

const ACTION_LABELS: Record<string, string> = {
  read: 'Read',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
};

const MANAGE_ACTIONS = ['read', 'create', 'edit', 'delete', 'approve'] as const;

function summarize(values?: string[]) {
  if (!values?.length) return '—';
  if (values.includes('*')) return 'All';
  if (values.length <= 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

function emptyDraft(resources: string[]): Record<(typeof MANAGE_ACTIONS)[number], Set<string>> {
  return {
    read: new Set(),
    create: new Set(),
    edit: new Set(),
    delete: new Set(),
    approve: new Set(),
  };
}

export function CampusAdminRolesPermissionsPage() {
  const api = useAuthedApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [draft, setDraft] = useState<Record<(typeof MANAGE_ACTIONS)[number], Set<string>>>(
    emptyDraft([]),
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      const qs = params.toString();
      const data = await api.get<RolesResponse>(
        `/api/campus-admin/roles-permissions${qs ? `?${qs}` : ''}`,
      );
      setRoles(data.roles ?? []);
      setResources(data.resources ?? []);
    } catch (err) {
      setRoles([]);
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [api, search]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => (prev === next ? prev : next));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filteredCount = useMemo(() => roles.length, [roles]);

  function openEdit(row: RoleRow) {
    const next = emptyDraft(resources);
    next.read = new Set(row.permissions.read ?? row.permissions.view ?? []);
    next.create = new Set(row.permissions.create ?? []);
    next.edit = new Set(row.permissions.edit ?? row.permissions.update ?? []);
    next.delete = new Set(row.permissions.delete ?? []);
    next.approve = new Set(row.permissions.approve ?? []);
    setDraft(next);
    setEditing(row);
  }

  function toggleResource(
    action: (typeof MANAGE_ACTIONS)[number],
    resource: string,
    checked: boolean,
  ) {
    setDraft((prev) => {
      const copy = new Set(prev[action]);
      if (checked) copy.add(resource);
      else copy.delete(resource);
      return { ...prev, [action]: copy };
    });
  }

  async function savePermissions() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = {
        read: [...draft.read],
        view: [...draft.read],
        create: [...draft.create],
        edit: [...draft.edit],
        update: [...draft.edit],
        delete: [...draft.delete],
        approve: [...draft.approve],
      };
      await api.put(
        `/api/campus-admin/roles-permissions/${encodeURIComponent(editing.role_name)}`,
        payload,
      );
      toast.success(`Permissions updated for ${editing.role_name}`);
      setEditing(null);
      setLoading(true);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">
              Roles & Permissions
            </h1>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search roles"
              className="h-11 rounded-xl border-sgvu-navy/15 pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading roles…
            </div>
          ) : error ? (
            <div className="space-y-4 px-6 py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : filteredCount === 0 ? (
            <div className="space-y-2 px-6 py-16 text-center">
              <p className="font-semibold text-sgvu-navy">No manageable roles found</p>
              <p className="text-sm text-muted-foreground">
                Adjust search or ensure campus-assignable roles exist in RBAC.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto p-4 md:p-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Role</TableHead>
                    <TableHead>Campus users</TableHead>
                    <TableHead>Read</TableHead>
                    <TableHead>Create</TableHead>
                    <TableHead>Edit</TableHead>
                    <TableHead>Delete</TableHead>
                    <TableHead>Approve</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((row) => (
                    <TableRow key={row.role_id}>
                      <TableCell className="font-semibold text-sgvu-navy">
                        {row.role_name}
                      </TableCell>
                      <TableCell>{row.user_count}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {summarize(row.permissions.read ?? row.permissions.view)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {summarize(row.permissions.create)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {summarize(row.permissions.edit ?? row.permissions.update)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {summarize(row.permissions.delete)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {summarize(row.permissions.approve)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'border-sgvu-navy/15',
                            row.source === 'override' && 'bg-sgvu-gold/10 text-sgvu-navy',
                          )}
                        >
                          {row.source === 'override' ? 'Custom' : 'Default'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg border-sgvu-navy/20"
                          onClick={() => openEdit(row)}
                          disabled={!row.can_manage}
                        >
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sgvu-navy">
              Manage permissions — {editing?.role_name}
            </DialogTitle>
            <DialogDescription>
              Toggle Read / Create / Edit / Delete / Approve for campus resources only. Privileged
              university resources are blocked by the API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {MANAGE_ACTIONS.map((action) => (
              <div
                key={action}
                className="rounded-xl border border-sgvu-navy/10 bg-sgvu-navy/[0.02] p-3"
              >
                <p className="mb-2 text-sm font-semibold text-sgvu-navy">
                  {ACTION_LABELS[action] ?? action}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {resources.map((resource) => {
                    const checked = draft[action].has(resource);
                    return (
                      <label
                        key={`${action}-${resource}`}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm hover:border-sgvu-navy/10 hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-sgvu-navy"
                          checked={checked}
                          onChange={(e) => toggleResource(action, resource, e.target.checked)}
                        />
                        <span className="text-sgvu-navy/90">{resource}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-sgvu-navy text-white hover:bg-sgvu-navy/90"
              disabled={saving}
              onClick={() => void savePermissions()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save permissions'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
