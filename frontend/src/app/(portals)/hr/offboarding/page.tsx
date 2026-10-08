'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Search, Users } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type Resignation = {
  resignation_id: string;
  employee_name: string;
  employee_id: string;
  last_working_day: string;
  reason: string;
  status: string;
  separation_mode: string | null;
  exit_status: string;
  fnf_deduct_checklist_penalty: boolean;
};

export default function HrOffboardingPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [rows, setRows] = useState<Resignation[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [exitStatus, setExitStatus] = useState<Record<string, string>>({});
  const [fnfPenalty, setFnfPenalty] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = () => void api.get<Resignation[]>('/api/hr/offboarding').then(setRows);

  useEffect(() => {
    load();
  }, [api, entityId]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
    const searchText = `${row.employee_name} ${row.employee_id} ${row.reason}`.toLowerCase();
    return matchesStatus && searchText.includes(query.trim().toLowerCase());
  }), [query, rows, statusFilter]);

  const pendingCount = rows.filter((row) => row.status === 'PENDING_HR' || row.status === 'HOD_CLEARED').length;
  const fnfCount = rows.filter((row) => row.exit_status === 'INITIATE_FNF').length;
  const completedCount = rows.filter((row) => row.exit_status === 'OFFBOARDED').length;

  async function saveExitMeta(resignationId: string) {
    try {
      await api.patch(`/api/hr/offboarding/${resignationId}/exit-status`, {
        exit_status: exitStatus[resignationId] ?? 'PENDING_CLEARANCE',
        fnf_deduct_checklist_penalty: fnfPenalty[resignationId] ?? false,
      });
      toast.success('Exit status updated');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function processExit(
    resignationId: string,
    mode: 'SERVE_NOTICE' | 'BUYOUT_NOTICE' | 'IMMEDIATE_SEPARATION',
  ) {
    try {
      await api.patch(`/api/hr/offboarding/${resignationId}/process`, { separation_mode: mode });
      toast.success('Exit processed — FNF pushed to Finance');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <>
      <HrPageHeader
        title="Offboarding & Resignation"
        description="HR control panel for exiting employees — notice period, buyout, or immediate separation."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-5 w-5 text-amber-600" /><div><p className="text-xs text-muted-foreground">Awaiting HR action</p><p className="text-xl font-bold text-sgvu-navy">{pendingCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-sgvu-gold" /><div><p className="text-xs text-muted-foreground">FNF to initiate</p><p className="text-xl font-bold text-sgvu-navy">{fnfCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground">Completed exits</p><p className="text-xl font-bold text-sgvu-navy">{completedCount}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-sgvu-navy">Exit cases</h2><p className="text-sm text-muted-foreground">Manage clearance, FNF, and final separation.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-sgvu-navy" /><input aria-label="Search exit cases" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee" className="h-10 rounded-xl border-2 border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-sgvu-gold sm:w-52" /></label>
            <Select aria-label="Filter exit cases by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border-2 border-gray-200 px-3 text-sm font-semibold sm:w-48"><option value="ALL">All statuses</option>{Array.from(new Set(rows.map((row) => row.status))).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.2fr_1fr_1fr_1.5fr] gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
          <span>Employee</span><span>Last working day</span><span>Workflow status</span><span>HR actions</span>
        </div>
        <div className="divide-y">
          {filteredRows.map((r) => (
            <div key={r.resignation_id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr_1fr_1.5fr] lg:items-start">
              <div>
                <p className="font-semibold text-sgvu-navy">{r.employee_name}</p>
                <p className="text-xs text-muted-foreground">{r.employee_id}</p>
                <p className="mt-2 text-sm text-muted-foreground">{r.reason}</p>
              </div>
              <div><p className="text-xs text-muted-foreground lg:hidden">Last working day</p><p className="text-sm font-medium">{r.last_working_day}</p></div>
              <div><p className="text-xs text-muted-foreground lg:hidden">Workflow status</p><Badge>{r.status.replaceAll('_', ' ')}</Badge><p className="mt-2 text-xs text-muted-foreground">Exit: {r.exit_status.replaceAll('_', ' ')}</p></div>
              <div className="space-y-3 rounded-xl bg-gray-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Select aria-label={`Exit status for ${r.employee_name}`} className="h-9 rounded-lg border bg-white px-2 text-xs" value={exitStatus[r.resignation_id] ?? r.exit_status ?? 'PENDING_CLEARANCE'} onChange={(e) => setExitStatus((s) => ({ ...s, [r.resignation_id]: e.target.value }))}>
                    <option value="PENDING_CLEARANCE">Pending Clearance</option><option value="INITIATE_FNF">Initiate FNF</option><option value="OFFBOARDED">Offboarded</option>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => void saveExitMeta(r.resignation_id)}>Save</Button>
                </div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={fnfPenalty[r.resignation_id] ?? r.fnf_deduct_checklist_penalty} onChange={(e) => setFnfPenalty((s) => ({ ...s, [r.resignation_id]: e.target.checked }))} /> Deduct checklist penalty in FNF</label>
                {r.status === 'PENDING_HR' || r.status === 'HOD_CLEARED' ? <>
                  <p className="text-xs font-semibold text-sgvu-navy">Separation mode</p>
                  <div className="flex flex-wrap gap-2 text-xs">{(['SERVE_NOTICE', 'BUYOUT_NOTICE', 'IMMEDIATE_SEPARATION'] as const).map((mode) => <label key={mode} className="flex items-center gap-1"><input type="radio" name={`mode-${r.resignation_id}`} checked={(selected[r.resignation_id] ?? 'SERVE_NOTICE') === mode} onChange={() => setSelected((s) => ({ ...s, [r.resignation_id]: mode }))} /> {mode.replaceAll('_', ' ')}</label>)}</div>
                  <Button size="sm" onClick={() => void processExit(r.resignation_id, (selected[r.resignation_id] ?? 'SERVE_NOTICE') as 'SERVE_NOTICE' | 'BUYOUT_NOTICE' | 'IMMEDIATE_SEPARATION')}>Clear & push to FNF</Button>
                </> : null}
              </div>
            </div>
          ))}
        </div>
        {!filteredRows.length && <div className="p-8 text-center text-sm text-muted-foreground">{rows.length ? 'No exit cases match your filters.' : 'No active resignation requests.'}</div>}
      </Card>
    </>
  );
}
