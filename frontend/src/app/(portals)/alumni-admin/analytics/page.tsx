'use client';

import { useEffect, useState } from 'react';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SimpleBarChart, SimplePieLegend } from '@/components/alumni/SimpleBarChart';
import { useAuthedApi } from '@/lib/api';

type Analytics = {
  corporate_retention: { label: string; value: number }[];
  higher_education: { label: string; value: number }[];
  mentorship: { mentors_opted_in: number; mentorship_sessions_completed: number };
};

export default function AlumniAnalyticsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    void api.get<Analytics>('/api/alumni-admin/analytics').then(setData);
  }, [api]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Engagement Analytics (NAAC)"
        description="Corporate retention, higher education pathways, and mentorship participation."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corporate retention</CardTitle>
          </CardHeader>
          <CardContent>
            <SimplePieLegend title="Top employers" items={data?.corporate_retention ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Higher education</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart title="Degrees pursued" items={data?.higher_education ?? []} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mentorship</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
          <p>
            Alumni opted in: <strong>{data?.mentorship.mentors_opted_in ?? 0}</strong>
          </p>
          <p>
            Completed mentorship sessions: <strong>{data?.mentorship.mentorship_sessions_completed ?? 0}</strong>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
