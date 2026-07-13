'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';

type ResignationRow = {
  resignation_id: string;
  employee_name: string;
  employee_email?: string;
  dept_name?: string;
  last_working_day: string;
  reason: string;
  status: string;
  exit_status?: string;
  created_at?: string;
};

export default function HodResignationsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<ResignationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ResignationRow[]>('/api/hr/ess/resignations/pending-hod?scope=dept');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load resignations');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(resignationId: string, approved: boolean) {
    try {
      await api.patch(`/api/hr/ess/resignation/${resignationId}/hod-clearance`, { approved });
      toast.success(approved ? 'HOD clearance granted — forwarded to HR' : 'Resignation rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Resignations & Offboarding"
        description="Faculty separation requests and exit clearance for your department. Grant HOD clearance before HR processes FNF."
      />
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.resignation_id}
        empty="No resignation or offboarding cases for your department."
        columns={[
          { key: 'name', label: 'Employee', render: (r) => (
            <div>
              <p className="font-semibold text-sgvu-navy">{r.employee_name}</p>
              <p className="text-xs text-muted-foreground">{r.dept_name ?? r.employee_email}</p>
            </div>
          ) },
          { key: 'lwd', label: 'Last working day', render: (r) => r.last_working_day },
          { key: 'reason', label: 'Reason', render: (r) => <span className="line-clamp-2 text-sm">{r.reason}</span> },
          { key: 'status', label: 'Status', render: (r) => (
            <Badge variant={r.status === 'PENDING_HOD' ? 'secondary' : 'outline'}>{r.status.replace(/_/g, ' ')}</Badge>
          ) },
          { key: 'exit', label: 'Exit', render: (r) => r.exit_status?.replace(/_/g, ' ') ?? '—' },
          { key: 'actions', label: '', render: (r) => r.status === 'PENDING_HOD' ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void act(r.resignation_id, true)}>Clear</Button>
              <Button size="sm" variant="outline" onClick={() => void act(r.resignation_id, false)}>Reject</Button>
            </div>
          ) : <span className="text-xs text-muted-foreground">With HR</span> },
        ]}
      />
    </HodPageFrame>
  );
}
