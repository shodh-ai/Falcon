'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const load = () => void api.get<Resignation[]>('/api/hr/offboarding').then(setRows);

  useEffect(() => {
    load();
  }, [api, entityId]);

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

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.resignation_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                {r.employee_name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{r.employee_id}</span>
              </CardTitle>
              <Badge>{r.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Last working day: {r.last_working_day}</p>
              <p className="text-muted-foreground">{r.reason}</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm">
                  Exit status
                  <select
                    className="ml-2 rounded border px-2 py-1 text-sm"
                    value={exitStatus[r.resignation_id] ?? r.exit_status ?? 'PENDING_CLEARANCE'}
                    onChange={(e) => setExitStatus((s) => ({ ...s, [r.resignation_id]: e.target.value }))}
                  >
                    <option value="PENDING_CLEARANCE">Pending Clearance</option>
                    <option value="INITIATE_FNF">Initiate FNF</option>
                    <option value="OFFBOARDED">Offboarded</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fnfPenalty[r.resignation_id] ?? r.fnf_deduct_checklist_penalty}
                    onChange={(e) => setFnfPenalty((s) => ({ ...s, [r.resignation_id]: e.target.checked }))}
                  />
                  Deduct checklist penalty in FNF
                </label>
                <Button size="sm" variant="outline" onClick={() => void saveExitMeta(r.resignation_id)}>
                  Save status
                </Button>
              </div>
              {r.status === 'PENDING_HR' || r.status === 'HOD_CLEARED' ? (
                <div className="space-y-2">
                  <p className="font-medium">Separation mode</p>
                  <div className="flex flex-wrap gap-4">
                    {(['SERVE_NOTICE', 'BUYOUT_NOTICE', 'IMMEDIATE_SEPARATION'] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`mode-${r.resignation_id}`}
                          checked={(selected[r.resignation_id] ?? 'SERVE_NOTICE') === mode}
                          onChange={() => setSelected((s) => ({ ...s, [r.resignation_id]: mode }))}
                        />
                        {mode.replaceAll('_', ' ')}
                      </label>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      void processExit(
                        r.resignation_id,
                        (selected[r.resignation_id] ?? 'SERVE_NOTICE') as 'SERVE_NOTICE' | 'BUYOUT_NOTICE' | 'IMMEDIATE_SEPARATION',
                      )
                    }
                  >
                    Clear & push to FNF
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">No active resignation requests.</p>}
      </div>
    </>
  );
}
