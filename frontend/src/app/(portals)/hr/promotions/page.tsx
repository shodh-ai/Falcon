'use client';

import { useEffect, useState } from 'react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type Candidate = {
  user_id: string;
  name: string;
  employee_id: string;
  designation: string;
  years_of_service: string;
  auto_api_score: string;
  last_promotion_to: string | null;
  last_promotion_date: string | null;
  promotion_eligibility: string;
};

export default function HrPromotionsPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [rows, setRows] = useState<Candidate[]>([]);

  useEffect(() => {
    void api.get<Candidate[]>('/api/hr/promotions/candidates').then(setRows);
  }, [api, entityId]);

  const eligible = rows.filter((r) => r.promotion_eligibility === 'ELIGIBLE');

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <HrPageHeader
        title="Promotions & Workflows"
        description="Assistant Professor → Associate Professor → Professor. Flags faculty meeting API score and service years."
      />

      <p className="text-sm text-muted-foreground">{eligible.length} faculty currently eligible for promotion review.</p>

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.user_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{r.name}</CardTitle>
              <Badge variant={r.promotion_eligibility === 'ELIGIBLE' ? 'default' : 'secondary'}>
                {r.promotion_eligibility.replace('_', ' ')}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{r.designation} · {r.employee_id}</p>
              <p>Service: {Math.floor(Number(r.years_of_service))} years · API: {Number(r.auto_api_score || 0).toFixed(1)}</p>
              <p>
                Last promotion: {r.last_promotion_to ?? '—'}{' '}
                {r.last_promotion_date ? `(${new Date(r.last_promotion_date).toLocaleDateString()})` : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
