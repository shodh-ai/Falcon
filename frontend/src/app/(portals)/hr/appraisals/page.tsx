"use client";

import { useState } from "react";
import Link from "next/link";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useHrSWR } from "@/hooks/useHrSWR";

type AppraisalRow = {
  appraisal_record_id: string;
  employee_name: string;
  employee_id: string;
  auto_api_score: string;
  api_breakdown: Record<string, number>;
  hr_final_status: string;
};

export default function HrAppraisalsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: rows = [], error } = useHrSWR<AppraisalRow[]>(
    ["hr-legacy-appraisals", year],
    `/api/hr/appraisals/api-scores?year=${year}`,
    { dedupingInterval: 0, revalidateOnMount: true },
  );

  return (
    <>
      <HrPageHeader
        title="Appraisals & API Scores"
        description="Saved legacy appraisal results. Viewing this page no longer recalculates or overwrites scores. Configure designation-specific rules separately."
        actions={
          <input
            type="number"
            className="w-24 rounded-md border px-2 py-1 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        }
      />
      <div className="my-4 rounded-lg border p-4 text-sm">
        <Link
          className="font-semibold underline"
          href="/hr/appraisals/policies"
        >
          Open Designation API Policies and calculation preview
        </Link>
        <p>
          Legacy publication scores and HoD ratings are not calculations under
          the new policy framework. New calculation records do not automatically
          approve appraisals or determine promotions.
        </p>
      </div>
      {!!error && (
        <p role="alert">
          {error instanceof Error
            ? error.message
            : "Could not load saved appraisals"}
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.appraisal_record_id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                {r.employee_name}{" "}
                <span className="text-muted-foreground">({r.employee_id})</span>
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
        {!error && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved faculty appraisal records for this year.
          </p>
        ) : null}
      </div>
    </>
  );
}
