'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type OrgNode = {
  unit_id: string;
  parent_id: string | null;
  unit_type: string;
  unit_name: string;
  children?: OrgNode[];
};

export default function HrOrgStructurePage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [form, setForm] = useState({ unit_type: 'DEPARTMENT', unit_name: '', parent_id: '' });

  const load = () => void api.get<OrgNode[]>('/api/hr/admin/org-structure').then(setTree);

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function addUnit() {
    try {
      await api.post('/api/hr/admin/org-structure', {
        unit_type: form.unit_type,
        unit_name: form.unit_name,
        parent_id: form.parent_id || undefined,
      });
      toast.success('Org unit created');
      setForm({ unit_type: 'DEPARTMENT', unit_name: '', parent_id: '' });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  function renderNode(node: OrgNode, depth = 0) {
    return (
      <div key={node.unit_id} style={{ marginLeft: depth * 16 }} className="py-1 text-sm">
        <span className="font-medium">{node.unit_name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{node.unit_type}</span>
        {node.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <HrPageHeader title="Organization Structure" description="Zone → Location → Branch → Department hierarchy per entity." />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={form.unit_type}
              onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
            >
              {['ZONE', 'LOCATION', 'BRANCH', 'DEPARTMENT', 'SUB_DEPARTMENT', 'COST_CENTER'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input placeholder="Unit name" value={form.unit_name} onChange={(e) => setForm({ ...form, unit_name: e.target.value })} />
            <Input
              placeholder="Parent unit ID (optional)"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            />
          </div>
          <Button size="sm" onClick={() => void addUnit()} disabled={!form.unit_name.trim()}>
            Add unit
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">{tree.map((n) => renderNode(n))}</CardContent>
      </Card>
    </div>
  );
}
