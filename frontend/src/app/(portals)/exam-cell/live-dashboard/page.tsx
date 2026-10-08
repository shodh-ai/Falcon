'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

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
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <ExamCellPageHeader
            pageId="live-dashboard"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value }) => (
          <Card
            key={label}
            className={
              value > 0 && label.includes('UFM')
                ? 'border-red-200 bg-white'
                : 'border-sgvu-navy/10 bg-white'
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-sgvu-navy/70">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
              ) : (
                <p
                  className={`text-3xl font-black tabular-nums ${
                    value > 0 && label.includes('UFM') ? 'text-red-600' : 'text-sgvu-navy'
                  }`}
                >
                  {value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
