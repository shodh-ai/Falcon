'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { Pencil, Trash2 } from 'lucide-react';

type Policy = {
  policy_id: string;
  leave_name: string;
  leave_code: string;
  leave_count: string;
  disbursement_cycle: string;
  allow_clubbing: boolean;
  sandwich_rule_enabled: boolean;
  status: string;
};

const DEFAULT_FORM = {
  leave_name: '',
  leave_code: '',
  leave_count: 12,
  disbursement_cycle: 'YEARLY',
  allow_clubbing: false,
  sandwich_rule_enabled: false,
};

export default function HrLeavePoliciesPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const load = () => void api.get<Policy[]>('/api/hr/admin/leave-policies').then(setPolicies);

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function save() {
    try {
      if (editingId) {
        await api.put(`/api/hr/admin/leave-policies/${editingId}`, form);
        toast.success('Policy updated');
      } else {
        await api.post('/api/hr/admin/leave-policies', form);
        toast.success('Policy created');
      }
      setForm(DEFAULT_FORM);
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  function edit(p: Policy) {
    setEditingId(p.policy_id);
    setForm({
      leave_name: p.leave_name,
      leave_code: p.leave_code,
      leave_count: Number(p.leave_count),
      disbursement_cycle: p.disbursement_cycle,
      allow_clubbing: p.allow_clubbing,
      sandwich_rule_enabled: p.sandwich_rule_enabled,
    });
  }

  async function deletePolicy(id: string) {
    if (!confirm('Are you sure you want to delete this policy?')) return;
    try {
      await api.del(`/api/hr/admin/leave-policies/${id}`);
      toast.success('Policy deleted');
      if (editingId === id) {
        setEditingId(null);
        setForm(DEFAULT_FORM);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete policy');
    }
  }

  return (
    <>
      <HrPageHeader title="Leave Policy Builder" description="Custom leave types with clubbing and sandwich rules per entity." />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <Input placeholder="Leave name" value={form.leave_name} onChange={(e) => setForm({ ...form, leave_name: e.target.value })} />
          <Input placeholder="Code (e.g. ML)" value={form.leave_code} onChange={(e) => setForm({ ...form, leave_code: e.target.value })} />
          <Input type="number" placeholder="Days" value={form.leave_count} onChange={(e) => setForm({ ...form, leave_count: Number(e.target.value) })} />
          <select className="rounded-md border px-2 py-2 text-sm" value={form.disbursement_cycle} onChange={(e) => setForm({ ...form, disbursement_cycle: e.target.value })}>
            {['MONTHLY', 'YEARLY', 'ON_JOIN'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allow_clubbing} onChange={(e) => setForm({ ...form, allow_clubbing: e.target.checked })} />
            Allow clubbing
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sandwich_rule_enabled} onChange={(e) => setForm({ ...form, sandwich_rule_enabled: e.target.checked })} />
            Sandwich rule
          </label>
          <div className="flex gap-2 col-span-1 sm:col-span-2">
            <Button size="sm" onClick={() => void save()} disabled={!form.leave_name || !form.leave_code}>
              {editingId ? 'Update policy' : 'Create policy'}
            </Button>
            {editingId && (
              <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm(DEFAULT_FORM); }}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Code</th>
                <th className="p-3">Days</th>
                <th className="p-3">Cycle</th>
                <th className="p-3">Rules</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.policy_id} className="border-b">
                  <td className="p-3">{p.leave_name}</td>
                  <td className="p-3 font-mono text-xs">{p.leave_code}</td>
                  <td className="p-3">{p.leave_count}</td>
                  <td className="p-3">{p.disbursement_cycle}</td>
                  <td className="p-3 text-xs">
                    {p.allow_clubbing && 'Clubbing '}
                    {p.sandwich_rule_enabled && 'Sandwich'}
                  </td>
                  <td className="p-3">
                    <Badge>{p.status}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => edit(p)} className="h-8 w-8 text-slate-500 hover:text-sgvu-navy">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deletePolicy(p.policy_id)} className="h-8 w-8 text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    No leave policies found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
