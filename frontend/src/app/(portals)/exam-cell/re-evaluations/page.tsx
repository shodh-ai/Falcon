'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ReEval = {
  exam_application_id: string;
  student_name: string;
  subject_name: string;
  subject_code: string;
  fee_status: string;
  status: string;
  created_at: string;
};

export default function ExamCellReEvaluationsPage() {
  const api = useAuthedApi();
  const [items, setItems] = useState<ReEval[]>([]);

  useEffect(() => {
    void api.get<ReEval[]>('/api/exam-cell/re-evaluations').then(setItems);
  }, [api]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Re-evaluations & Backlogs</h1>
        <p className="text-sm text-muted-foreground">Only appears after Razorpay fee SUCCESS (₹500 re-eval demand).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{items.length} paid applications in queue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground">No paid re-evaluation requests yet.</p>
          ) : (
            items.map((r) => (
              <div key={r.exam_application_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{r.student_name}</p>
                  <p className="text-muted-foreground">{r.subject_code} · {r.subject_name}</p>
                </div>
                <Badge>{r.fee_status} · {r.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
