'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Plus, UserPlus, Users, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type EntityRow = {
  entity_id: number;
  entity_code: string;
  entity_name: string;
  address: string | null;
  contact_email: string | null;
  tax_id: string | null;
  logo_url: string | null;
  is_active: boolean;
  employee_count: number;
};

type AccessRow = {
  access_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  granted_at: string;
};

type GrantableUser = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};

export default function SuperAdminEntitiesPage() {
  const api = useAuthedApi();
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<EntityRow | null>(null);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [grantable, setGrantable] = useState<GrantableUser[]>([]);
  const [grantQuery, setGrantQuery] = useState('');
  const [form, setForm] = useState({
    entity_name: '',
    entity_code: '',
    address: '',
    contact_email: '',
    tax_id: '',
  });

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      setEntities(await api.get<EntityRow[]>('/api/super-admin/entities'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  async function openEntity(entity: EntityRow) {
    setSelected(entity);
    setGrantQuery('');
    try {
      const [accessRows, users] = await Promise.all([
        api.get<AccessRow[]>(`/api/super-admin/entities/${entity.entity_id}/access`),
        api.get<GrantableUser[]>('/api/super-admin/entities/grantable-users'),
      ]);
      setAccess(accessRows);
      setGrantable(users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load access');
    }
  }

  async function searchGrantable(q: string) {
    setGrantQuery(q);
    try {
      const path = q.trim()
        ? `/api/super-admin/entities/grantable-users?q=${encodeURIComponent(q)}`
        : '/api/super-admin/entities/grantable-users';
      setGrantable(await api.get<GrantableUser[]>(path));
    } catch {
      /* ignore */
    }
  }

  async function createEntity(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/super-admin/entities', form);
      toast.success('Entity created — you now have access');
      setShowModal(false);
      setForm({ entity_name: '', entity_code: '', address: '', contact_email: '', tax_id: '' });
      await loadEntities();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function grantAccess(userId: string) {
    if (!selected) return;
    try {
      const rows = await api.post<AccessRow[]>(
        `/api/super-admin/entities/${selected.entity_id}/access`,
        { user_id: userId },
      );
      setAccess(rows);
      toast.success('Access granted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Grant failed');
    }
  }

  async function revokeAccess(userId: string) {
    if (!selected) return;
    try {
      await api.del(`/api/super-admin/entities/${selected.entity_id}/access/${userId}`);
      setAccess((prev) => prev.filter((a) => a.user_id !== userId));
      toast.success('Access revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revoke failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-sgvu-navy">Entity Management</h2>
          <p className="text-sm text-muted-foreground">
            Add schools, campuses, and legal entities. Control which HR admins see each org.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Entity
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-sgvu-gold" />
            Master Entity Registry
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Entity</th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Employees</th>
                    <th className="py-2 pr-3">Tax ID</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((entity) => (
                    <tr key={entity.entity_id} className="border-b">
                      <td className="py-3 pr-3 font-medium">{entity.entity_name}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{entity.entity_code}</td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {entity.employee_count}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{entity.tax_id ?? '—'}</td>
                      <td className="py-3 pr-3">
                        <Badge variant={entity.is_active ? 'default' : 'secondary'}>
                          {entity.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="outline" onClick={() => void openEntity(entity)}>
                          Assign HR/Admins
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!entities.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">No entities yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Assign HR/Admins — {selected.entity_name}
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Users with access</p>
              <ul className="space-y-2">
                {access.map((row) => (
                  <li key={row.access_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.email} · {row.role}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void revokeAccess(row.user_id)}>
                      Revoke
                    </Button>
                  </li>
                ))}
                {!access.length && (
                  <p className="text-sm text-muted-foreground">No users assigned yet.</p>
                )}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Grant access</p>
              <Input
                placeholder="Search HR / admin by name or email…"
                value={grantQuery}
                onChange={(e) => void searchGrantable(e.target.value)}
                className="mb-3"
              />
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {grantable
                  .filter((u) => !access.some((a) => a.user_id === u.user_id))
                  .map((user) => (
                    <li
                      key={user.user_id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.email} · {user.role}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void grantAccess(user.user_id)}>
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="text-base">Add New Entity</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createEntity} className="space-y-3">
                <Input
                  placeholder="Entity Name (e.g. SGVU Law College)"
                  value={form.entity_name}
                  onChange={(e) => setForm((f) => ({ ...f, entity_name: e.target.value }))}
                  required
                />
                <Input
                  placeholder="Entity Code (e.g. SGVU-LAW)"
                  value={form.entity_code}
                  onChange={(e) => setForm((f) => ({ ...f, entity_code: e.target.value.toUpperCase() }))}
                  required
                />
                <Input
                  placeholder="Billing address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
                <Input
                  type="email"
                  placeholder="Contact email"
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
                <Input
                  placeholder="Tax ID / GSTIN / PAN"
                  value={form.tax_id}
                  onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                />
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create entity'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
