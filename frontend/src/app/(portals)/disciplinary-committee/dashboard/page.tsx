'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList, Scale, Users } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type DashboardStats = {
  pending_review: number;
  approved_this_month: number;
  rejected_this_month: number;
  subject_back_students: number;
};

export default function DisciplinaryCommitteeDashboardPage() {
  const api = useAuthedApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    void api
      .get<DashboardStats>('/api/demerits/dashboard')
      .then(setStats)
      .catch(() => toast.error('Could not load DC dashboard'));
  }, [api]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Disciplinary Committee</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">DC Command Centre</h1>
        <p className="text-sm text-muted-foreground">
          Review faculty incident reports. Approved demerit points accumulate — 6 points triggers Subject Back.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Pending review" value={stats?.pending_review ?? '—'} icon={ClipboardList} />
        <StatCard title="Approved this month" value={stats?.approved_this_month ?? '—'} icon={Scale} />
        <StatCard title="Rejected this month" value={stats?.rejected_this_month ?? '—'} icon={AlertTriangle} />
        <StatCard title="Subject Back students" value={stats?.subject_back_students ?? '—'} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next step</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Open the <strong>Disciplinary Queue</strong> from the sidebar to review pending incidents, inspect evidence,
          and approve or reject with mandatory committee remarks.
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-sgvu-gold/15 p-3">
          <Icon className="h-5 w-5 text-sgvu-navy" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-sgvu-navy">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
