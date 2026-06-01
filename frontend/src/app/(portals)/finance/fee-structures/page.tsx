'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Template = {
  template_id: string;
  template_name: string;
  academic_year: string;
  semester: number;
  total_amount: string;
};

export default function FinanceFeeStructuresPage() {
  const api = useAuthedApi();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState('2026-27');
  const [total, setTotal] = useState('100000');
  const [jobId, setJobId] = useState<string | null>(null);

  const load = () => void api.get<Template[]>('/finance/fee-templates').then(setTemplates).catch(() => setTemplates([]));

  useEffect(() => {
    load();
  }, [api]);

  async function createTemplate() {
    try {
      await api.post('/finance/fee-templates', {
        template_name: name,
        academic_year: academicYear,
        total_amount: Number(total),
        fee_breakup: { tuition_fee: Number(total) * 0.85, development_fee: Number(total) * 0.15 },
      });
      toast.success('Fee template saved');
      setName('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function generateDemands(templateId?: string) {
    try {
      const res = await api.post<{ job_id: string }>('/finance/demands/bulk-generate', {
        template_id: templateId,
        academic_year: academicYear,
        semester: 3,
      });
      setJobId(res.job_id);
      toast.success('Demand generation queued (BullMQ)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Queue failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Fee Structures & Demands"
        description="Define batch templates and generate semester invoices for thousands of students in the background."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New fee template</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="B.Tech CSE — 2026 Batch" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Academic year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          <Input placeholder="Total (₹)" value={total} onChange={(e) => setTotal(e.target.value)} />
          <Button onClick={() => void createTemplate()}>Save template</Button>
        </CardContent>
      </Card>
      {templates.map((t) => (
        <Card key={t.template_id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-semibold">{t.template_name}</p>
              <p className="text-muted-foreground">
                {t.academic_year} · Sem {t.semester} · {formatInr(t.total_amount)}
              </p>
            </div>
            <Button size="sm" onClick={() => void generateDemands(t.template_id)}>
              Generate demands
            </Button>
          </CardContent>
        </Card>
      ))}
      {jobId && (
        <p className="text-sm text-muted-foreground">
          Background job <span className="font-mono">{jobId}</span> — refresh demands list when complete.
        </p>
      )}
    </div>
  );
}
