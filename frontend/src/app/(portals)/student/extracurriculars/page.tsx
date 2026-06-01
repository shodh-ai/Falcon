'use client';

import { useEffect, useState } from 'react';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ExtraData = {
  records: { activity_type: string; details: string; credits_awarded: number; event_date: string }[];
  totals: { activity_type: string; credits: number }[];
};

export default function StudentExtracurricularsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExtraData | null>(null);

  useEffect(() => {
    void api.get<ExtraData>('/api/student/extracurriculars').then(setData);
  }, [api]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Extra-Curriculars (NCC / NSS / SODECA)"
        description="Centralized log of non-academic university credits — camps, ranks, and SODECA points."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {(data?.totals ?? []).map((t) => (
          <Card key={t.activity_type}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t.activity_type}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black text-sgvu-navy">{t.credits}</p>
              <p className="text-xs text-muted-foreground">credits logged</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.records ?? []).map((r, i) => (
            <div key={i} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <Badge>{r.activity_type}</Badge>
                <span className="text-muted-foreground">{r.event_date ? new Date(r.event_date).toLocaleDateString() : '—'}</span>
              </div>
              <p className="mt-2">{r.details}</p>
              <p className="mt-1 text-xs text-sgvu-gold">+{r.credits_awarded} credits</p>
            </div>
          ))}
          {!data?.records?.length && (
            <p className="text-muted-foreground">No extracurricular records yet. Faculty/Admin will log NSS camps and NCC activities here.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
