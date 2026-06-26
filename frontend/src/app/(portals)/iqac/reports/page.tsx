'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { IqacPageHeader } from '@/components/iqac/IqacPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type ReportJob = {
  job_id: string;
  report_type: string;
  academic_year: string;
  status: string;
  created_at: string;
};

export default function IqacReportsPage() {
  const api = useAuthedApi();
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [year, setYear] = useState('2025-2026');
  const [type, setType] = useState<'AQAR' | 'SSR'>('AQAR');

  const load = () => void api.get<ReportJob[]>('/iqac/reports').then(setJobs).catch(() => setJobs([]));

  useEffect(() => {
    load();
  }, [api]);

  async function generate() {
    try {
      const result = await api.post<{ download_payload: unknown; message: string }>('/iqac/reports/generate', {
        report_type: type,
        academic_year: year,
      });
      const blob = new Blob([JSON.stringify(result.download_payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${year}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(result.message ?? 'Report generated');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <IqacPageHeader title="Automated Report Generator" description="AQAR (annual) and SSR (5-year) data bundles from live campus modules." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate report</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select className="rounded-md border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value as 'AQAR' | 'SSR')}>
            <option value="AQAR">AQAR — Annual Quality Assurance Report</option>
            <option value="SSR">SSR — Self Study Report</option>
          </Select>
          <Select className="rounded-md border px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
            <option>2025-2026</option>
            <option>2024-2025</option>
          </Select>
          <Button onClick={() => void generate()}>Generate & Download bundle</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {jobs.map((j) => (
            <p key={j.job_id}>
              {j.report_type} · {j.academic_year} · <span className="font-medium">{j.status}</span> ·{' '}
              {new Date(j.created_at).toLocaleString()}
            </p>
          ))}
          {!jobs.length && <p className="text-muted-foreground">No reports generated yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
