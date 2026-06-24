'use client';

import { Select } from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellConfig } from '@/lib/api/api.ecell';

const selectClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20';

const APPROVER_ROLES = ['HOD', 'Dean', 'Registrar', 'President', 'IQAC', 'Faculty'];

export default function IncubationCohortSettingsPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<EcellConfig[]>([]);
  const [form, setForm] = useState({
    cohort_name: '',
    max_funding_limit: 100000,
    level_1_approver_role: 'HOD',
    level_2_approver_role: 'Dean',
  });

  const load = useCallback(async () => {
    const rows = await ecellApi.listConfig();
    setConfigs(rows);
    const active = rows.find((c) => c.is_active) ?? rows[0];
    if (active) {
      setForm({
        cohort_name: active.cohort_name,
        max_funding_limit: Number(active.max_funding_limit ?? 100000),
        level_1_approver_role: active.level_1_approver_role,
        level_2_approver_role: active.level_2_approver_role,
      });
    }
  }, [ecellApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('Could not load cohort settings'))
      .finally(() => setLoading(false));
  }, [load]);

  async function save(openWindow: boolean) {
    setSaving(true);
    try {
      await ecellApi.upsertConfig({ ...form, is_active: openWindow });
      toast.success(openWindow ? 'Application window opened' : 'Cohort configuration saved');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading cohort settings…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Cohort Configurations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open or close application windows (e.g. Winter Incubation Drive) and define L1/L2 approver roles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Cohort</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Cohort Name</label>
            <Input
              value={form.cohort_name}
              onChange={(e) => setForm((f) => ({ ...f, cohort_name: e.target.value }))}
              placeholder="Winter Incubation Drive 2026"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Max Funding Limit (INR)</label>
            <Input
              type="number"
              min={0}
              value={form.max_funding_limit}
              onChange={(e) =>
                setForm((f) => ({ ...f, max_funding_limit: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Level 1 Approver Role</label>
              <Select
                className={selectClassName}
                value={form.level_1_approver_role}
                onChange={(e) => setForm((f) => ({ ...f, level_1_approver_role: e.target.value }))}
              >
                {APPROVER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Level 2 Approver Role</label>
              <Select
                className={selectClassName}
                value={form.level_2_approver_role}
                onChange={(e) => setForm((f) => ({ ...f, level_2_approver_role: e.target.value }))}
              >
                {APPROVER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save(true)} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Open Application Window
            </Button>
            <Button variant="outline" onClick={() => void save(false)} disabled={saving}>
              Close Applications
            </Button>
          </div>
        </CardContent>
      </Card>

      {configs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Cohort History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {configs.map((c) => (
              <div key={c.config_id} className="rounded-lg border px-3 py-2">
                <p className="font-semibold text-sgvu-navy">
                  {c.cohort_name} {c.is_active ? '(Open)' : '(Closed)'}
                </p>
                <p className="text-muted-foreground">
                  L1: {c.level_1_approver_role} · L2: {c.level_2_approver_role}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
