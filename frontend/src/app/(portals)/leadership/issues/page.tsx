'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeadershipMetricCard, LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import { useLeadershipApi } from '@/lib/api/api.leadership';

type IssuesDashboard = {
  kpis: { open_tickets: number; sla_breaches: number; avg_resolution_hours: number };
  department_heatmap: Array<{ department: string; open_count: number }>;
  escalation_inbox: Array<Record<string, unknown>>;
};

export default function LeadershipIssuesPage() {
  const api = useLeadershipApi();
  const [data, setData] = useState<IssuesDashboard | null>(null);

  const reload = () => {
    void api.issues().then((d) => setData(d as IssuesDashboard)).catch(() => setData(null));
  };

  useEffect(() => {
    reload();
  }, [api]);

  const escalate = async (ticketId: string) => {
    try {
      const res = await api.escalateIssue(ticketId);
      toast.success(`Escalated to ${res.notified_hod}`);
      reload();
    } catch {
      toast.error('Escalation failed');
    }
  };

  const maxHeat = Math.max(...(data?.department_heatmap.map((d) => d.open_count) ?? [1]), 1);

  return (
    <div className="space-y-6 p-6">
      <LeadershipPageHeader
        eyebrow="Grievance Command Center"
        title="Issue Monitoring"
        description="SLA-tracked helpdesk tickets · 48-hour breach escalations to department heads"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <LeadershipMetricCard label="Open Tickets (Live)" value={String(data?.kpis.open_tickets ?? '—')} highlight />
        <LeadershipMetricCard label="Avg Resolution Time" value={`${data?.kpis.avg_resolution_hours ?? '—'} hrs`} />
        <LeadershipMetricCard
          label="SLA Breaches"
          value={String(data?.kpis.sla_breaches ?? '—')}
          alert={(data?.kpis.sla_breaches ?? 0) > 0}
        />
      </div>

      <LeadershipSectionCard title="Department Health Heatmap">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.department_heatmap ?? []).map((row) => (
            <div
              key={row.department}
              className="rounded-xl border border-sgvu-navy/10 p-4"
              style={{ background: `rgba(8, 35, 74, ${0.04 + (row.open_count / maxHeat) * 0.2})` }}
            >
              <p className="text-xs font-medium text-muted-foreground">{row.department}</p>
              <p className="font-mono text-2xl font-black text-sgvu-navy">{row.open_count}</p>
              <p className="text-xs text-muted-foreground">open tickets</p>
            </div>
          ))}
        </div>
      </LeadershipSectionCard>

      <LeadershipSectionCard title="Escalation Inbox" description="Only tickets breaching the 48-hour SLA">
        <div className="space-y-2">
          {(data?.escalation_inbox ?? []).map((t) => (
            <div
              key={String(t.ticket_id)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  {String(t.subject)}
                </p>
                <p className="text-xs text-red-700/80">
                  {String(t.category)} · {String(t.student_name)} · Level {String(t.escalation_level ?? 0)}
                </p>
              </div>
              <Button
                size="sm"
                className="bg-sgvu-navy hover:bg-sgvu-navy/90"
                onClick={() => void escalate(String(t.ticket_id))}
              >
                Escalate to HOD
              </Button>
            </div>
          ))}
          {(data?.escalation_inbox ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No SLA breaches in the escalation inbox.</p>
          ) : null}
        </div>
      </LeadershipSectionCard>
    </div>
  );
}
