'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type Template = {
  template_id: string;
  workflow_type: string;
  task_name: string;
  assigned_to_role: string;
  is_mandatory: boolean;
  sort_order: number;
};

export default function HrChecklistTemplatesPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    workflow_type: 'ONBOARDING',
    task_name: '',
    assigned_to_role: 'HR',
    sort_order: 0,
  });

  const load = () => void api.get<Template[]>('/api/hr/admin/checklist-templates').then(setTemplates);

  useEffect(() => {
    load();
  }, [api, entityId]);

  async function create() {
    try {
      await api.post('/api/hr/admin/checklist-templates', form);
      toast.success('Template added');
      setForm({ workflow_type: 'ONBOARDING', task_name: '', assigned_to_role: 'HR', sort_order: 0 });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <HrPageHeader title="Checklist Templates" description="Onboarding and offboarding task templates spawned on hire or resignation." />

      <Card>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
          <select className="rounded-md border px-2 py-2 text-sm" value={form.workflow_type} onChange={(e) => setForm({ ...form, workflow_type: e.target.value })}>
            <option value="ONBOARDING">ONBOARDING</option>
            <option value="OFFBOARDING">OFFBOARDING</option>
          </select>
          <Input placeholder="Task name" value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} />
          <Input placeholder="Assigned role (HR, IT…)" value={form.assigned_to_role} onChange={(e) => setForm({ ...form, assigned_to_role: e.target.value })} />
          <Input type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          <Button size="sm" onClick={() => void create()} disabled={!form.task_name.trim()}>
            Add template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3">Type</th>
                <th className="p-3">Task</th>
                <th className="p-3">Role</th>
                <th className="p-3">Order</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.template_id} className="border-b">
                  <td className="p-3">{t.workflow_type}</td>
                  <td className="p-3">{t.task_name}</td>
                  <td className="p-3">{t.assigned_to_role}</td>
                  <td className="p-3">{t.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
