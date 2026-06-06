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

export default function HrLeavePoliciesPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [form, setForm] = useState({
    leave_name: '',
    leave_code: '',
    leave_count: 12,
    disbursement_cycle: 'YEARLY',
    allow_clubbing: false,
    sandwich_rule_enabled: false,
  });

  const load = () => void api.get<Policy[]>('/api/hr/admin/leave-policies').then(setPolicies);

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function create() {
    try {
      await api.post('/api/hr/admin/leave-policies', form);
      toast.success('Policy created');
      setForm({ leave_name: '', leave_code: '', leave_count: 12, disbursement_cycle: 'YEARLY', allow_clubbing: false, sandwich_rule_enabled: false });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
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
          <Button size="sm" onClick={() => void create()} disabled={!form.leave_name || !form.leave_code}>
            Create policy
          </Button>
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
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
