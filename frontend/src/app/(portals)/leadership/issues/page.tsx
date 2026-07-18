'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LeadershipPageHeader, LeadershipSectionCard } from '@/components/leadership/LeadershipSectionCard';
import {
  ExecutiveDateRangeFilter,
  ExecutiveExportButton,
  TrafficLightKpi,
  type ExecutivePeriod,
} from '@/components/leadership/executive';
import { useLeadershipApi } from '@/lib/api/api.leadership';
import { usePresidentApi } from '@/lib/api/api.president';
import { useAuth } from '@/context/AuthContext';

type IssuesDashboard = {
  kpis: { open_tickets: number; sla_breaches: number; avg_resolution_hours: number };
  department_heatmap: Array<{ department: string; open_count: number }>;
  escalation_inbox: Array<Record<string, unknown>>;
};

export default function LeadershipIssuesPage() {
  const api = useLeadershipApi();
  const presidentApi = usePresidentApi();
  const { user } = useAuth();
  const isPresident =
    user?.role === 'President' ||
    user?.primaryRole === 'President' ||
    user?.roles?.includes('President');
  const [period, setPeriod] = useState<ExecutivePeriod>('year');
  const [data, setData] = useState<IssuesDashboard | null>(null);
  const [compliance, setCompliance] = useState<Record<string, unknown> | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<Record<string, string>>({});

  const reload = () => {
    void api.issues().then((d) => setData(d as IssuesDashboard)).catch(() => setData(null));
    void api.complianceSummary().then(setCompliance).catch(() => setCompliance(null));
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

  const presidentDecide = async (ticketId: string) => {
    const decision = decisionDraft[ticketId]?.trim();
    if (!decision) {
      toast.error('Enter an executive decision');
      return;
    }
    try {
      await presidentApi.grievanceDecision(ticketId, { decision });
      toast.success('Executive decision recorded');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed');
    }
  };

  const maxHeat = Math.max(...(data?.department_heatmap.map((d) => d.open_count) ?? [1]), 1);
  const stale = Number(compliance?.stale_grievances ?? 0);
  const naac = Number(compliance?.naac_readiness_score ?? 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeadershipPageHeader
        eyebrow="Compliance, Risk & Grievances"
        title="Issue Monitoring & Accreditation"
        description="Unified helpdesk + student grievances · SLA and accreditation readiness"
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <ExecutiveDateRangeFilter value={period} onChange={setPeriod} />
            <ExecutiveExportButton targetId="issues-dashboard" filename="compliance-grievances" />
          </div>
        }
      />

      <div id="issues-dashboard" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrafficLightKpi label="Open Grievances" value={String(compliance?.open_grievances ?? data?.kpis.open_tickets ?? '—')} status="yellow" />
          <TrafficLightKpi label="Resolved" value={String(compliance?.resolved_grievances ?? '—')} status="green" />
          <TrafficLightKpi
            label="Pending >7 Days"
            value={String(stale)}
            status={stale > 0 ? 'red' : 'green'}
          />
          <TrafficLightKpi
            label="NAAC Readiness"
            value={`${naac}%`}
            status={naac >= 70 ? 'green' : 'yellow'}
          />
        </div>

        {stale > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {stale} complaint(s) pending for more than 7 days require executive attention
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <TrafficLightKpi label="SLA Breaches" value={String(data?.kpis.sla_breaches ?? '—')} status={(data?.kpis.sla_breaches ?? 0) > 0 ? 'red' : 'green'} />
          <TrafficLightKpi label="Avg Resolution" value={`${data?.kpis.avg_resolution_hours ?? '—'} hrs`} status="green" />
          <TrafficLightKpi label="Hostel Occupancy" value={`${compliance?.hostel_occupancy_pct ?? '—'}%`} status="green" />
        </div>

        <LeadershipSectionCard title="Accreditation Readiness">
          <div className="grid gap-4 sm:grid-cols-2">
            <TrafficLightKpi label="NAAC Readiness Score" value={`${naac}%`} status={naac >= 70 ? 'green' : 'yellow'} sub="Track upcoming NAAC/NBA inspections in IQAC module" />
            <TrafficLightKpi
              label="Transport Utilization"
              value={`${(compliance?.transport as { capacity_utilization_pct?: number })?.capacity_utilization_pct ?? '—'}%`}
              status="green"
              sub={`${(compliance?.transport as { buses_on_route?: number })?.buses_on_route ?? 0} buses on route`}
            />
          </div>
        </LeadershipSectionCard>

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

        <LeadershipSectionCard title="Escalation Inbox" description="Tickets breaching SLA">
          <div className="space-y-2">
            {(data?.escalation_inbox ?? []).map((t) => (
              <div
                key={String(t.ticket_id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-sgvu-navy">{String(t.subject ?? 'Ticket')}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(t.category ?? '')} · {String(t.student_name ?? '')}
                    {t.escalation_level != null ? ` · Level ${String(t.escalation_level)}` : ''}
                  </p>
                </div>
                {isPresident && Number(t.escalation_level ?? 0) >= 4 ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[320px]">
                    <Input
                      placeholder="Executive decision / assignment note"
                      value={decisionDraft[String(t.ticket_id)] ?? ''}
                      onChange={(e) =>
                        setDecisionDraft((prev) => ({ ...prev, [String(t.ticket_id)]: e.target.value }))
                      }
                    />
                    <Button size="sm" onClick={() => void presidentDecide(String(t.ticket_id))}>
                      Record President decision
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => void escalate(String(t.ticket_id))}>
                    Escalate to HOD
                  </Button>
                )}
              </div>
            ))}
          </div>
        </LeadershipSectionCard>
      </div>
    </div>
  );
}
