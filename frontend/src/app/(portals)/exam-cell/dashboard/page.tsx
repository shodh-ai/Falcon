'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Eye, Shield, Ticket, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Dashboard = {
  persona: string;
  schedules: number;
  pending_coe_marks: number;
  re_evaluations_queue: number;
  open_ufm_cases: number;
  invigilation_duties_published: number;
};

export default function ExamCellDashboardPage() {
  const api = useAuthedApi();
  const [stats, setStats] = useState<Dashboard | null>(null);

  const load = useCallback(() => {
    void api.get<Dashboard>('/api/exam-cell/dashboard').then(setStats);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const tiles = [
    { label: 'Exam schedules', value: stats?.schedules ?? 0, icon: CalendarDays, href: '/exam-cell/schedule' },
    { label: 'Pending COE review', value: stats?.pending_coe_marks ?? 0, icon: TrendingUp, href: '/exam-cell/results' },
    { label: 'Paid re-evaluations', value: stats?.re_evaluations_queue ?? 0, icon: Ticket, href: '/exam-cell/re-evaluations' },
    { label: 'Open UFM cases', value: stats?.open_ufm_cases ?? 0, icon: Shield, href: '/exam-cell/ufm-cases' },
    { label: 'Invigilation duties', value: stats?.invigilation_duties_published ?? 0, icon: Eye, href: '/exam-cell/invigilation' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl bg-gradient-to-br from-sgvu-navy to-sgvu-navy/90 p-6 text-white shadow-xl md:p-8">
        <p className="text-sm font-medium text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Controller of Examinations</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          Closed-loop exam operations — finance dues, attendance gates, faculty grading, and invigilation sync in one workspace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon, href }) => (
          <Card key={label} className="border-border/70 transition hover:border-sgvu-gold/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-5 w-5 text-sgvu-gold" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-sgvu-navy">{value}</p>
              <Button asChild variant="link" className="mt-2 h-auto p-0 text-sgvu-gold">
                <Link href={href}>Open →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pre-exam quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link href="/exam-cell/admit-cards">Generate admit cards</Link></Button>
            <Button asChild variant="outline"><Link href="/exam-cell/seating">Auto-allocate seats</Link></Button>
            <Button asChild variant="outline"><Link href="/exam-cell/invigilation">Publish invigilation</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Post-exam quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link href="/exam-cell/results">Publish results</Link></Button>
            <Button asChild variant="outline"><Link href="/exam-cell/ufm-cases">Log UFM case</Link></Button>
            <Button asChild variant="outline"><Link href="/exam-cell/transcripts">Generate transcripts</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
