'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Scale } from 'lucide-react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrDataTable, HrTable, HrTableHead, HrTh, HrTableBody, HrTr, HrTd } from '@/components/hr/HrDataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type DynamicRule = {
  rule_id: string;
  rule_name: string;
  condition_type: string;
  operator: string;
  threshold_value: string;
  threshold_unit: string;
  action_type: string;
  priority: number;
  is_active: boolean;
};

const CONDITIONS = ['PUNCH_IN_LATE', 'PUNCH_OUT_EARLY', 'MISSED_PUNCH', 'OCCURRENCE_COUNT'] as const;
const OPERATORS = ['GT', 'GTE', 'EQ', 'LT', 'LTE'] as const;
const UNITS = ['MINUTES', 'OCCURRENCES', 'DAYS'] as const;
const ACTIONS = ['DEDUCT_HALF_DAY', 'DEDUCT_CL', 'MARK_LOP', 'RETROACTIVE_PENALTY'] as const;

const emptyForm = {
  rule_name: '',
  condition_type: 'PUNCH_IN_LATE' as (typeof CONDITIONS)[number],
  operator: 'GT' as (typeof OPERATORS)[number],
  threshold_value: 15,
  threshold_unit: 'MINUTES' as (typeof UNITS)[number],
  action_type: 'DEDUCT_HALF_DAY' as (typeof ACTIONS)[number],
  priority: 100,
};

export default function HrRulesPage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [rules, setRules] = useState<DynamicRule[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DynamicRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!entityReady) return;
    void api.get<DynamicRule[]>('/api/hr/admin/rules').then(setRules);
  };

  useEffect(() => {
    load();
  }, [api, entityId, entityReady]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(rule: DynamicRule) {
    setEditing(rule);
    setForm({
      rule_name: rule.rule_name,
      condition_type: rule.condition_type as (typeof CONDITIONS)[number],
      operator: rule.operator as (typeof OPERATORS)[number],
      threshold_value: Number(rule.threshold_value),
      threshold_unit: rule.threshold_unit as (typeof UNITS)[number],
      action_type: rule.action_type as (typeof ACTIONS)[number],
      priority: rule.priority,
    });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/hr/admin/rules/${editing.rule_id}`, form);
        toast.success('Rule updated');
      } else {
        await api.post('/api/hr/admin/rules', form);
        toast.success('Rule created');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: DynamicRule) {
    try {
      await api.patch(`/api/hr/admin/rules/${rule.rule_id}`, { is_active: !rule.is_active });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toggle failed');
    }
  }

  async function remove(ruleId: string) {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.post(`/api/hr/admin/rules/${ruleId}/delete`, {});
      load();
      toast.success('Rule deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <>
      <HrPageHeader
        title="Attendance Rules Engine"
        description="Unlimited IF/THEN rules evaluated nightly — late punch-in, early exit, missed punch, occurrence penalties."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Add New Rule
          </Button>
        }
      />

      {rules.length === 0 ? (
        <HrEmptyState
          icon={Scale}
          title="No rules configured"
          description="Create your first attendance rule to automate penalties and compliance."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              Add New Rule
            </Button>
          }
        />
      ) : (
        <HrDataTable>
          <HrTable minWidth="900px">
            <HrTableHead>
              <HrTh>Name</HrTh>
              <HrTh>Condition</HrTh>
              <HrTh>Threshold</HrTh>
              <HrTh>Action</HrTh>
              <HrTh>Priority</HrTh>
              <HrTh>Status</HrTh>
              <HrTh className="text-right">Actions</HrTh>
            </HrTableHead>
            <HrTableBody>
              {rules.map((rule) => (
                <HrTr key={rule.rule_id}>
                  <HrTd className="font-semibold text-gray-900">{rule.rule_name}</HrTd>
                  <HrTd className="text-xs text-muted-foreground">
                    {rule.condition_type.replace(/_/g, ' ')} {rule.operator}
                  </HrTd>
                  <HrTd>
                    {rule.threshold_value} {rule.threshold_unit}
                  </HrTd>
                  <HrTd className="text-xs">{rule.action_type.replace(/_/g, ' ')}</HrTd>
                  <HrTd>{rule.priority}</HrTd>
                  <HrTd>
                    <HrStatusBadge status={rule.is_active ? 'ON' : 'OFF'} />
                  </HrTd>
                  <HrTd className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(rule)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void toggleActive(rule)}>
                        Toggle
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(rule.rule_id)}>
                        Delete
                      </Button>
                    </div>
                  </HrTd>
                </HrTr>
              ))}
            </HrTableBody>
          </HrTable>
        </HrDataTable>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg border-gray-100 shadow-xl">
            <CardContent className="space-y-4 p-6">
              <h3 className="text-lg font-bold text-sgvu-navy">{editing ? 'Edit Rule' : 'New Rule'}</h3>
              <label className="block text-sm">
                Rule Name
                <Input
                  className="mt-1 border-gray-200"
                  value={form.rule_name}
                  onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Condition If
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                  value={form.condition_type}
                  onChange={(e) =>
                    setForm({ ...form, condition_type: e.target.value as (typeof CONDITIONS)[number] })
                  }
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-sm">
                  Operator
                  <select
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                    value={form.operator}
                    onChange={(e) =>
                      setForm({ ...form, operator: e.target.value as (typeof OPERATORS)[number] })
                    }
                  >
                    {OPERATORS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Threshold
                  <Input
                    type="number"
                    className="mt-1 border-gray-200"
                    value={form.threshold_value}
                    onChange={(e) => setForm({ ...form, threshold_value: Number(e.target.value) })}
                  />
                </label>
                <label className="text-sm">
                  Unit
                  <select
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                    value={form.threshold_unit}
                    onChange={(e) =>
                      setForm({ ...form, threshold_unit: e.target.value as (typeof UNITS)[number] })
                    }
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                Action Then
                <select
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                  value={form.action_type}
                  onChange={(e) =>
                    setForm({ ...form, action_type: e.target.value as (typeof ACTIONS)[number] })
                  }
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Priority (lower runs first)
                <Input
                  type="number"
                  className="mt-1 border-gray-200"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={saving || !form.rule_name.trim()} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
