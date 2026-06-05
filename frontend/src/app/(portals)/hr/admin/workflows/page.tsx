'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type Step = { step_order: number; approver_type: string; approver_ref?: string };
type Workflow = {
  workflow_id: string;
  workflow_name: string;
  action_type: string;
  is_active: boolean;
  steps: Step[];
};

export default function HrWorkflowsPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [form, setForm] = useState({
    workflow_name: '',
    action_type: 'LEAVE',
    steps: [{ step_order: 1, approver_type: 'REPORTING_MANAGER' }] as Step[],
  });

  const load = () => void api.get<Workflow[]>('/api/hr/admin/workflows').then(setWorkflows);

  useEffect(() => {
    load();
  }, [api, entityId]);

  function addStep() {
    setForm((f) => ({
      ...f,
      steps: [...f.steps, { step_order: f.steps.length + 1, approver_type: 'ROLE', approver_ref: 'HR' }],
    }));
  }

  async function create() {
    try {
      await api.post('/api/hr/admin/workflows', form);
      toast.success('Workflow created');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <HrPageHeader title="Approval Workflows" description="Ordered approval chains for leave, resignation, comp-off, and CTC updates." />

      <Card>
        <CardContent className="space-y-3 p-4">
          <Input placeholder="Workflow name" value={form.workflow_name} onChange={(e) => setForm({ ...form, workflow_name: e.target.value })} />
          <select className="w-full rounded-md border px-2 py-2 text-sm" value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}>
            {['LEAVE', 'ON_DUTY', 'REGULARIZATION', 'RESIGNATION', 'COMP_OFF', 'CTC_UPDATE'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {form.steps.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <Input type="number" value={s.step_order} readOnly />
              <select
                className="rounded-md border px-2 py-2 text-sm"
                value={s.approver_type}
                onChange={(e) => {
                  const steps = [...form.steps];
                  steps[i] = { ...steps[i], approver_type: e.target.value };
                  setForm({ ...form, steps });
                }}
              >
                {['REPORTING_MANAGER', 'DEPT_HEAD', 'ROLE', 'SPECIFIC_USER'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Role or user ID"
                value={s.approver_ref ?? ''}
                onChange={(e) => {
                  const steps = [...form.steps];
                  steps[i] = { ...steps[i], approver_ref: e.target.value };
                  setForm({ ...form, steps });
                }}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addStep}>
              Add step
            </Button>
            <Button size="sm" onClick={() => void create()} disabled={!form.workflow_name.trim()}>
              Save workflow
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {workflows.map((w) => (
          <Card key={w.workflow_id}>
            <CardContent className="p-4 text-sm">
              <p className="font-semibold">
                {w.workflow_name} <span className="text-muted-foreground">({w.action_type})</span>
              </p>
              <ol className="mt-2 list-decimal pl-5 text-muted-foreground">
                {(w.steps ?? []).map((s) => (
                  <li key={s.step_order}>
                    {s.approver_type} {s.approver_ref ? `— ${s.approver_ref}` : ''}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
