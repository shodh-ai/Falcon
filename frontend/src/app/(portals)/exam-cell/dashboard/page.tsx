'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ClipboardCheck,
  Eye,
  GraduationCap,
  Loader2,
  RefreshCw,
  Shield,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type DashboardStats = {
  upcoming_exams: number;
  todays_exams: number;
  active_exam_sessions: number;
  registered_students: number;
  students_eligible: number;
  hall_tickets_generated: number;
  todays_attendance: number;
  form_registrations: number;
  pending_hall_tickets: number;
  pending_coe_marks: number;
  pending_results: number;
  re_evaluations_queue: number;
  pending_supplementary: number;
  invigilators_assigned_today: number;
  open_ufm_cases: number;
  result_status_chart: { label: string; count: number }[];
  recent_activity: {
    audit_id: string;
    action: string;
    resource_type: string;
    created_at: string;
    actor_name: string | null;
  }[];
};

export default function ExamCellDashboardPage() {
  const api = useAuthedApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<DashboardStats>('/api/exam-cell/dashboard');
      setStats(data);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[dashboard]', e);
      }
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const metricCards = useMemo(
    () => [
      { label: 'Upcoming exams', value: stats?.upcoming_exams ?? 0, icon: CalendarDays, href: '/exam-cell/schedule' },
      { label: "Today's exams", value: stats?.todays_exams ?? 0, icon: CalendarDays, href: '/exam-cell/schedule' },
      { label: 'Active sessions', value: stats?.active_exam_sessions ?? 0, icon: GraduationCap, href: '/exam-cell/sessions' },
      { label: 'Registered students', value: stats?.registered_students ?? 0, icon: Users, href: '/exam-cell/form-fillup' },
      { label: 'Students eligible', value: stats?.students_eligible ?? 0, icon: Users, href: '/exam-cell/eligibility' },
      { label: 'Hall tickets generated', value: stats?.hall_tickets_generated ?? 0, icon: Ticket, href: '/exam-cell/admit-cards' },
      { label: 'Pending hall tickets', value: stats?.pending_hall_tickets ?? 0, icon: Ticket, href: '/exam-cell/admit-cards' },
      { label: "Today's attendance", value: stats?.todays_attendance ?? 0, icon: ClipboardCheck, href: '/exam-cell/exam-day' },
      { label: 'Form registrations', value: stats?.form_registrations ?? 0, icon: GraduationCap, href: '/exam-cell/form-fillup' },
      { label: 'Pending results', value: stats?.pending_results ?? 0, icon: TrendingUp, href: '/exam-cell/results' },
      { label: 'Pending COE review', value: stats?.pending_coe_marks ?? 0, icon: ClipboardCheck, href: '/exam-cell/results' },
      { label: 'Revaluation queue', value: stats?.re_evaluations_queue ?? 0, icon: Ticket, href: '/exam-cell/re-evaluations' },
      { label: 'Supplementary pending', value: stats?.pending_supplementary ?? 0, icon: GraduationCap, href: '/exam-cell/re-evaluations' },
      { label: 'Invigilators today', value: stats?.invigilators_assigned_today ?? 0, icon: Eye, href: '/exam-cell/invigilation' },
      { label: 'Open UFM cases', value: stats?.open_ufm_cases ?? 0, icon: Shield, href: '/exam-cell/ufm-cases' },
    ],
    [stats],
  );

  const chartData = (stats?.result_status_chart ?? []).map((r) => ({
    name: r.label.replace('_', ' '),
    count: r.count,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl bg-gradient-to-br from-sgvu-navy to-sgvu-navy/90 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-sgvu-gold">Falcon Exam OS</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Examination Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75">
              Enterprise examination operations — sessions, hall tickets, seating, results, and compliance in one workspace.
            </p>
          </div>
          <Button variant="outline" size="sm" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {metricCards.map(({ label, value, icon: Icon, href }) => (
          <Card key={label} className="border-border/70 transition hover:border-sgvu-gold/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-sgvu-gold" />
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : (
                <p className={`text-2xl font-black tabular-nums ${value > 0 ? 'text-sgvu-navy' : 'text-muted-foreground'}`}>{value}</p>
              )}
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-xs text-sgvu-gold">
                <Link href={href}>Open module →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Result processing status</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No declared result reports yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild size="sm"><Link href="/exam-cell/my-tasks">My tasks inbox</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/exam-cell/form-fillup">Form fill-up desk</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/exam-cell/admit-cards">Generate hall tickets</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/exam-cell/seating">Allocate seating</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/exam-cell/results">Publish results</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/exam-cell/search">Global search</Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent audit activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(stats?.recent_activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
          ) : (
            stats?.recent_activity.map((row) => (
              <div key={row.audit_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-sgvu-navy">{row.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{row.resource_type} · {row.actor_name ?? 'System'}</p>
                </div>
                <Badge variant="outline">{new Date(row.created_at).toLocaleString('en-IN')}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
