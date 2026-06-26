'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { Pencil, Trash2, Power } from 'lucide-react';

type Step = { step_order: number; approver_type: string; approver_ref?: string };
type Workflow = {
  workflow_id: string;
  workflow_name: string;
  action_type: string;
  is_active: boolean;
  steps: Step[];
};

type Role = { role_id: string; role_name: string };
type AccessUser = { user_id: string; name: string; email: string };

const DEFAULT_FORM = {
  workflow_name: '',
  action_type: 'LEAVE',
  steps: [{ step_order: 1, approver_type: 'REPORTING_MANAGER' }] as Step[],
};

export default function HrWorkflowsPage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AccessUser[]>([]);

  const load = () => {
    if (!entityReady) return;
    void api.get<Workflow[]>('/api/hr/admin/workflows').then(setWorkflows);
  };

  useEffect(() => {
    load();
    if (entityReady) {
      void api.get<{ roles: Role[] }>('/api/hr/metadata/roles-departments')
        .then((d) => setRoles(d.roles))
        .catch(() => {});
      void api.get<AccessUser[]>('/api/hr/admin/permissions?limit=500')
        .then((u) => setUsers(u))
        .catch(() => {});
    }
  }, [api, entityId, entityReady]);

  function addStep() {
    setForm((f) => ({
      ...f,
      steps: [...f.steps, { step_order: f.steps.length + 1, approver_type: 'ROLE', approver_ref: roles[0]?.role_name ?? '' }],
    }));
  }

  function removeStep(index: number) {
    setForm((f) => {
      const newSteps = [...f.steps];
      newSteps.splice(index, 1);
      newSteps.forEach((s, i) => { s.step_order = i + 1; });
      return { ...f, steps: newSteps };
    });
  }

  async function save() {
    try {
      if (editingId) {
        await api.put(`/api/hr/admin/workflows/${editingId}`, form);
        toast.success('Workflow updated');
      } else {
        await api.post('/api/hr/admin/workflows', form);
        toast.success('Workflow created');
      }
      setForm(DEFAULT_FORM);
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  function edit(w: Workflow) {
    setEditingId(w.workflow_id);
    setForm({
      workflow_name: w.workflow_name,
      action_type: w.action_type,
      steps: w.steps.map(s => ({ ...s })),
    });
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await api.del(`/api/hr/admin/workflows/${id}`);
      toast.success('Workflow deleted');
      if (editingId === id) {
        setEditingId(null);
        setForm(DEFAULT_FORM);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete workflow');
    }
  }

  async function toggleActive(w: Workflow) {
    try {
      await api.put(`/api/hr/admin/workflows/${w.workflow_id}`, { is_active: !w.is_active });
      toast.success(w.is_active ? 'Workflow disabled' : 'Workflow enabled');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to toggle status');
    }
  }

  return (
    <>
      <HrPageHeader title="Approval Workflows" description="Ordered approval chains for leave, resignation, comp-off, and CTC updates." />

      <Card>
        <CardContent className="space-y-3 p-4">
          <Input placeholder="Workflow name" value={form.workflow_name} onChange={(e) => setForm({ ...form, workflow_name: e.target.value })} />
          <Select className="w-full rounded-md border px-2 py-2 text-sm bg-white" value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}>
            {['LEAVE', 'ON_DUTY', 'REGULARIZATION', 'RESIGNATION', 'COMP_OFF', 'CTC_UPDATE'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          {form.steps.map((s, i) => (
            <div key={i} className="flex gap-2">
              <Input type="number" className="w-16" value={s.step_order} readOnly />
              <Select
                className="rounded-md border px-2 py-2 text-sm flex-1 bg-white"
                value={s.approver_type}
                onChange={(e) => {
                  const steps = [...form.steps];
                  steps[i] = { ...steps[i], approver_type: e.target.value };
                  if (e.target.value === 'ROLE') steps[i].approver_ref = roles[0]?.role_name ?? '';
                  if (e.target.value === 'SPECIFIC_USER') steps[i].approver_ref = users[0]?.user_id ?? '';
                  setForm({ ...form, steps });
                }}
              >
                {['REPORTING_MANAGER', 'DEPT_HEAD', 'HR_EXECUTIVE', 'HR_ADMIN', 'ROLE', 'SPECIFIC_USER'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              
              <div className="flex-[2]">
                {s.approver_type === 'ROLE' ? (
                  <Select
                    className="w-full rounded-md border px-2 py-2 text-sm bg-white"
                    value={s.approver_ref ?? ''}
                    onChange={(e) => {
                      const steps = [...form.steps];
                      steps[i] = { ...steps[i], approver_ref: e.target.value };
                      setForm({ ...form, steps });
                    }}
                  >
                    <option value="">Select a role...</option>
                    {roles.map(r => (
                      <option key={r.role_id} value={r.role_name}>{r.role_name}</option>
                    ))}
                  </Select>
                ) : s.approver_type === 'SPECIFIC_USER' ? (
                  <Select
                    className="w-full rounded-md border px-2 py-2 text-sm bg-white"
                    value={s.approver_ref ?? ''}
                    onChange={(e) => {
                      const steps = [...form.steps];
                      steps[i] = { ...steps[i], approver_ref: e.target.value };
                      setForm({ ...form, steps });
                    }}
                  >
                    <option value="">Select a user...</option>
                    {users.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.name} ({u.email})</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    placeholder="Approver reference (optional)"
                    value={s.approver_ref ?? ''}
                    onChange={(e) => {
                      const steps = [...form.steps];
                      steps[i] = { ...steps[i], approver_ref: e.target.value };
                      setForm({ ...form, steps });
                    }}
                  />
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addStep}>
              Add step
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!form.workflow_name.trim()}>
              {editingId ? 'Update workflow' : 'Create workflow'}
            </Button>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setForm(DEFAULT_FORM); }}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {workflows.map((w) => (
          <Card key={w.workflow_id} className={w.is_active ? '' : 'opacity-70 grayscale-[0.5]'}>
            <CardContent className="p-4 text-sm flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sgvu-navy">
                    {w.workflow_name} <span className="text-muted-foreground font-normal">({w.action_type})</span>
                  </p>
                  <Badge variant={w.is_active ? 'default' : 'secondary'} className={w.is_active ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : ''}>
                    {w.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <ol className="mt-3 list-decimal pl-5 text-muted-foreground space-y-1">
                  {(w.steps ?? []).map((s) => {
                    let refDisplay = s.approver_ref;
                    if (s.approver_type === 'SPECIFIC_USER' && s.approver_ref) {
                       const u = users.find(x => x.user_id === s.approver_ref);
                       if (u) refDisplay = `${u.name} (${u.email})`;
                    }
                    return (
                      <li key={s.step_order}>
                        <span className="font-medium text-slate-700">{s.approver_type}</span> {refDisplay ? `— ${refDisplay}` : ''}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title={w.is_active ? 'Disable workflow' : 'Enable workflow'} onClick={() => toggleActive(w)} className="text-slate-500 hover:text-sgvu-navy hover:bg-slate-100">
                  <Power className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Edit workflow" onClick={() => edit(w)} className="text-slate-500 hover:text-sgvu-navy hover:bg-slate-100">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete workflow" onClick={() => deleteWorkflow(w.workflow_id)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {workflows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No workflows found.
          </div>
        )}
      </div>
    </>
  );
}
