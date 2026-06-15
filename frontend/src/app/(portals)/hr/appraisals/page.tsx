'use client';

import { useEffect, useState } from 'react';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

type AppraisalRow = {
  appraisal_record_id: string;
  employee_name: string;
  employee_id: string;
  auto_api_score: string;
  api_breakdown: Record<string, number>;
  hr_final_status: string;
};

export default function HrAppraisalsPage() {
  const api = useHrApi();
  const { entityId } = useHrEntity();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<AppraisalRow[]>([]);

  useEffect(() => {
    void api.get<AppraisalRow[]>(`/api/hr/appraisals/api-scores?year=${year}`).then(setRows);
  }, [api, entityId, year]);

  return (
    <>
      <HrPageHeader
        title="Appraisals & API Scores"
        description="UGC-style Academic Performance Indicator auto-calculated from faculty research logs (Scopus +10, book chapter +5, etc.)."
        actions={
          <input
            type="number"
            className="w-24 rounded-md border px-2 py-1 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        }
      />

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.appraisal_record_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                {r.employee_name} <span className="text-muted-foreground">({r.employee_id})</span>
              </CardTitle>
              <Badge>API {Number(r.auto_api_score).toFixed(1)}</Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {Object.entries(r.api_breakdown ?? {}).map(([k, v]) => (
                <span key={k} className="mr-3">
                  {k}: {v} pts
                </span>
              ))}
              <p className="mt-2">Status: {r.hr_final_status}</p>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No faculty appraisal records for this year.</p> : null}
      </div>
    </>
  );
}
