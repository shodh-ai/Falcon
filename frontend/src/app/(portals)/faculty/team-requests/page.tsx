'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type Tab = 'LEAVE' | 'ON_DUTY' | 'REGULARIZATION' | 'COMP_OFF_CREDIT';

type TeamRow = {
  leave_id: string;
  request_type: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  regularization_date: string | null;
  reason: string | null;
  employee: { user_id: string; name: string; email: string | null };
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'LEAVE', label: 'Leave approvals' },
  { id: 'ON_DUTY', label: 'On duty (OD)' },
  { id: 'REGULARIZATION', label: 'Attendance regularization' },
  { id: 'COMP_OFF_CREDIT', label: 'Comp-off requests' },
];

export default function FacultyTeamRequestsPage() {
  const api = useAuthedApi();
  const [tab, setTab] = useState<Tab>('LEAVE');
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(active: Tab) {
    setLoading(true);
    try {
      const data = await api.get<TeamRow[]>(`/api/hr/workforce/team/pending?type=${active}`);
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load team queue');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(tab);
  }, [api, tab]);

  async function act(leaveId: string, action: 'APPROVE' | 'REJECT') {
    const comment =
      action === 'REJECT'
        ? window.prompt('Reason for rejection (shown to employee)?') ?? undefined
        : window.prompt('Optional note (e.g. meeting link / room)?') ?? undefined;
    if (action === 'REJECT' && (!comment || comment.length < 3)) {
      toast.error('A short reason is required');
      return;
    }
    try {
      await api.patch(`/api/hr/workforce/team/${leaveId}/action`, { action, comment });
      toast.success(action === 'APPROVE' ? 'Approved' : 'Rejected');
      await load(tab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Team requests — Pending on me</h2>
        <p className="text-sm text-muted-foreground">
          Approve or reject requests from employees who report to you.
        </p>
      </section>

      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t.id ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{TABS.find((t) => t.id === tab)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing pending in this queue.</p>
          )}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Employee</th>
                    <th className="py-2 pr-4">Dates</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.leave_id} className="border-b">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{row.employee.name}</p>
                        <p className="text-xs text-muted-foreground">{row.employee.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {row.regularization_date ?? `${row.start_date}${row.end_date !== row.start_date ? ` – ${row.end_date}` : ''}`}
                        <Badge className="ml-2" variant="outline">
                          {row.leave_type}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 max-w-xs">{row.reason ?? '—'}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void act(row.leave_id, 'APPROVE')}>
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => void act(row.leave_id, 'REJECT')}>
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
