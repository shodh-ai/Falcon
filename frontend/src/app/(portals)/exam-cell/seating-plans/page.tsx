'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ api: typeof api; revision: number; plans: SeatingPlan[]; error: string | null } | null>(null);
  const currentResult = result?.api === api && result.revision === revision ? result : null;
  const loading = !currentResult;
  const error = currentResult?.error;
  const plans = currentResult?.plans ?? [];

  useEffect(() => {
    let current = true;
    void api.get<SeatingPlan[]>('/api/exam-cell/seating-plans')
      .then((plans) => {
        if (current) setResult({ api, revision, plans, error: null });
      }).catch((cause: unknown) => {
        if (current) setResult({ api, revision, plans: [], error: cause instanceof Error ? cause.message : 'Could not load seating plans' });
      });
    return () => { current = false; };
  }, [api, revision]);

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
          <CardTitle className="text-base">{loading ? 'Loading published room plans' : error ? 'Published room plans unavailable' : `${plans.length} published room plans`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p>{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setRevision((current) => current + 1)}>Retry seating plans</Button>
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
