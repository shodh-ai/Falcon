'use client';

import { useEffect, useState } from 'react';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Audits = {
  student_satisfaction: {
    by_faculty: { faculty_name: string; dept_name: string; avg_score: string; responses: number }[];
    by_department: { dept_name: string; avg_score: string; responses: number }[];
  };
};

export default function IqacAuditsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<Audits | null>(null);

  useEffect(() => {
    void api.get<Audits>('/iqac/audits?academic_year=2025-2026').then(setData);
  }, [api]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <IqacPageHeader title="Academic Audits & Feedback" description="Student Satisfaction Survey (SSS) aggregates per faculty and department." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.student_satisfaction.by_department ?? []).map((d) => (
            <div key={d.dept_name} className="flex justify-between border-b py-2">
              <span>{d.dept_name}</span>
              <span className="font-semibold">
                {d.avg_score} / 5 ({d.responses} responses)
              </span>
            </div>
          ))}
          {!data?.student_satisfaction.by_department?.length && (
            <p className="text-muted-foreground">No feedback records yet. Students submit SSS on their portal.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By faculty</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">Faculty</th>
                <th className="p-2">Department</th>
                <th className="p-2">Avg score</th>
                <th className="p-2">Responses</th>
              </tr>
            </thead>
            <tbody>
              {(data?.student_satisfaction.by_faculty ?? []).map((f, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{f.faculty_name}</td>
                  <td className="p-2">{f.dept_name ?? '—'}</td>
                  <td className="p-2 font-semibold">{f.avg_score}</td>
                  <td className="p-2">{f.responses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
