'use client';

import { Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Loader2, Mail, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HrStatCard } from '@/components/hr/HrStatCard';
import { TeamScopeBar, useTeamScope } from '@/components/ess/TeamScopeBar';
import { useAuthedApi } from '@/lib/api';

type AttentionUser = { user_id: string; name: string; cnt?: number; anomaly_count?: number };

type DashboardPayload = {
  scope: string;
  month: string;
  team_size: number;
  metrics: {
    avg_working_hours: number;
    avg_leave_taken: number;
    avg_early_going_pct: number;
    avg_late_arrival_pct: number;
    attendance_pct: number;
  };
  leaderboard: {
    on_time_arrival: Array<{ user_id: string; name: string; on_time_days: number }>;
    least_leaves: Array<{ user_id: string; name: string; leave_days: number }>;
    top_working_hours: Array<{ user_id: string; name: string; avg_hours: string }>;
  };
  need_attention: {
    unplanned_leaves: AttentionUser[];
    late_early_anomalies: AttentionUser[];
  };
};

function DashboardContent() {
  const api = useAuthedApi();
  const scope = useTeamScope();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [attentionUser, setAttentionUser] = useState<AttentionUser | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setLoading(true);
    void api
      .get<DashboardPayload>(`/api/hr/ess/team/dashboard?scope=${scope}`)
      .then(setData)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load dashboard');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [api, scope]);

  async function sendAttention(action: 'WARNING_EMAIL' | 'SCHEDULE_1ON1') {
    if (!attentionUser) return;
    setActing(true);
    try {
      await api.post('/api/hr/ess/team/attention', {
        user_id: attentionUser.user_id,
        action,
      });
      toast.success(action === 'WARNING_EMAIL' ? 'Warning sent' : '1-on-1 invite sent');
      setAttentionUser(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
      </div>
    );
  }

  if (!data) return null;

  const attention = [
    ...data.need_attention.unplanned_leaves.map((u) => ({ ...u, kind: 'Unplanned leaves' as const })),
    ...data.need_attention.late_early_anomalies.map((u) => ({ ...u, kind: 'Late / early pattern' as const })),
  ];

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <TeamScopeBar />
      </Suspense>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>
          {data.team_size} team member{data.team_size === 1 ? '' : 's'} · {data.month}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <HrStatCard label="Avg working hours" value={data.metrics.avg_working_hours} icon={Clock} />
        <HrStatCard label="Avg leave taken" value={data.metrics.avg_leave_taken} />
        <HrStatCard label="Avg early going %" value={`${data.metrics.avg_early_going_pct}%`} />
        <HrStatCard label="Avg late arrival %" value={`${data.metrics.avg_late_arrival_pct}%`} />
        <HrStatCard label="Attendance %" value={`${data.metrics.attendance_pct}%`} accent="navy" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LeaderboardCard
          title="On-Time Arrival"
          subtitle="Top 5 punctual staff"
          rows={data.leaderboard.on_time_arrival.map((r) => ({
            name: r.name,
            value: `${r.on_time_days} days`,
          }))}
        />
        <LeaderboardCard
          title="Least Leaves Taken"
          subtitle="Minimum leave this month"
          rows={data.leaderboard.least_leaves.map((r) => ({
            name: r.name,
            value: `${r.leave_days} day${r.leave_days === 1 ? '' : 's'}`,
          }))}
        />
        <LeaderboardCard
          title="Avg Working Hrs"
          subtitle="Top 5 by hours logged"
          rows={data.leaderboard.top_working_hours.map((r) => ({
            name: r.name,
            value: `${r.avg_hours} hrs`,
          }))}
        />
      </div>

      <Card className="border-red-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Need Attention
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">No red flags in this scope.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {attention.map((u) => (
                <button
                  key={`${u.user_id}-${u.kind}`}
                  type="button"
                  onClick={() => setAttentionUser(u)}
                  className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/50 p-3 text-left transition hover:bg-red-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sgvu-navy text-sm font-bold text-white">
                    {u.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="font-medium text-sgvu-navy">{u.name}</p>
                    <p className="text-xs text-red-700">{u.kind}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!attentionUser} onOpenChange={(o) => !o && setAttentionUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick action — {attentionUser?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Send a manager notice or schedule a 1-on-1 to address attendance concerns.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={acting} onClick={() => void sendAttention('SCHEDULE_1ON1')}>
              Schedule 1-on-1
            </Button>
            <Button disabled={acting} onClick={() => void sendAttention('WARNING_EMAIL')}>
              <Mail className="mr-2 h-4 w-4" />
              Send Warning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaderboardCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ name: string; value: string }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center justify-between text-sm">
            <span className="font-medium text-sgvu-navy">
              <span className="mr-2 text-sgvu-gold">#{i + 1}</span>
              {r.name}
            </span>
            <span className="text-muted-foreground">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function EssTeamDashboardPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin" />}>
      <DashboardContent />
    </Suspense>
  );
}
