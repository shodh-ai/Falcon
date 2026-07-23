'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExamCellPageHeader } from '@/components/exam-cell/ExamCellPageHeader';
import { useAuthedApi } from '@/lib/api';
import Link from 'next/link';

type SeatingPlan = {
  seating_plan_id: string;
  room: string;
  published: boolean;
  exam_type?: string;
  exam_date?: string;
  venue?: string;
  seating_map: unknown;
  created_at: string;
};

function seatCount(map: unknown): number {
  return Array.isArray(map) ? map.length : 0;
}

export default function ExamCellSeatingPlansPage() {
  const api = useAuthedApi();
  const [plans, setPlans] = useState<SeatingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<SeatingPlan[]>('/api/exam-cell/seating-plans');
      setPlans(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load seating plans');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <ExamCellPageHeader
            pageId="seating-plans"
            actions={
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
              >
                <Link href="/exam-cell/seating">Open Seating Planner</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{plans.length} published room plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : plans.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No seating plans published yet. Run auto-allocate in the Seating Planner — plans publish automatically.
            </p>
          ) : (
            plans.map((p) => (
              <div key={p.seating_plan_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-sgvu-navy">{p.room}</p>
                  <p className="text-muted-foreground">
                    {p.exam_type ?? 'Exam'} · {p.exam_date ? String(p.exam_date).slice(0, 10) : '—'} · {seatCount(p.seating_map)} seats
                  </p>
                </div>
                <Badge variant={p.published ? 'default' : 'secondary'}>
                  {p.published ? 'Published' : 'Draft'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
