'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';

type LiveStats = {
  as_of: string;
  exams_running: number;
  students_present: number;
  students_absent: number;
  rooms_active: number;
  invigilators_present: number;
  late_entries: number;
  ufm_cases_today: number;
  pending_incidents: number;
};

export default function ExamCellLiveDashboardPage() {
  const api = useAuthedApi();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      setStats(await api.get<LiveStats>('/api/exam-cell/live-dashboard'));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[live-dashboard]', e);
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  const cards = [
    { label: 'Exams running', value: stats?.exams_running ?? 0 },
    { label: 'Students present', value: stats?.students_present ?? 0 },
    { label: 'Students absent', value: stats?.students_absent ?? 0 },
    { label: 'Rooms active', value: stats?.rooms_active ?? 0 },
    { label: 'Invigilators on duty', value: stats?.invigilators_present ?? 0 },
    { label: 'Late entries', value: stats?.late_entries ?? 0 },
    { label: 'UFM cases today', value: stats?.ufm_cases_today ?? 0 },
    { label: 'Pending incidents', value: stats?.pending_incidents ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <ExamCellPageHeader pageId="live-dashboard" actions={
        <div className="flex items-center gap-2">
          <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onClick={() => setAutoRefresh((v) => !v)}>
            <Activity className="mr-2 h-4 w-4" />Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      } />

      <p className="text-xs text-muted-foreground">
        Last updated: {stats?.as_of ? new Date(stats.as_of).toLocaleTimeString('en-IN') : '—'} · Refreshes every 30s when enabled
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value }) => (
          <Card key={label} className={value > 0 && label.includes('UFM') ? 'border-red-200 bg-red-50/30' : ''}>
            <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                <p className="text-3xl font-black tabular-nums text-sgvu-navy">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
