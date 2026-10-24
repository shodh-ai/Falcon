'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Template = {
  template_id: string;
  template_name: string;
  academic_year: string;
  semester: number | null;
  total_amount: string;
};
type BulkJob = { status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; generated_count: number; error_message?: string | null };

export default function FinanceFeeStructuresPage() {
  const api = useAuthedApi();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState('');
  const [total, setTotal] = useState('');
  const [formError, setFormError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<BulkJob | null>(null);
  const [jobRefreshError, setJobRefreshError] = useState(false);
  const [lastTemplateId, setLastTemplateId] = useState<string | null>(null);

  const load = useCallback(() => void api.get<Template[]>('/finance/fee-templates').then(setTemplates).catch(() => setTemplates([])), [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const status = await api.get<BulkJob>(`/finance/demands/jobs/${jobId}`);
        if (active) {
          setJobStatus(status);
          setJobRefreshError(false);
          if (status.status === 'COMPLETED' || status.status === 'FAILED') window.clearInterval(interval);
        }
      } catch {
        if (active) setJobRefreshError(true);
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [api, jobId]);

  async function createTemplate() {
    const amount = Number(total);
    if (!name.trim()) return setFormError('Enter a template or batch name.');
    if (!/^\d{4}-\d{2}$/.test(academicYear.trim())) return setFormError('Enter the academic year as YYYY-YY, for example 2026-27.');
    if (!semester) return setFormError('Select the semester.');
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('Enter a total fee greater than zero.');
    setFormError('');
    try {
      await api.post('/finance/fee-templates', {
        template_name: name.trim(),
        academic_year: academicYear.trim(),
        semester: Number(semester),
        total_amount: amount,
        fee_breakup: { total_amount: amount },
      });
      toast.success('Fee template saved');
      setName('');
      setTotal('');
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save the template');
    }
  }

  async function generateDemands(template: Template) {
    if (!template.semester) {
      toast.error('This template has no semester. Create a template with a semester before generating demands.');
      return;
    }
    if (!window.confirm(`Generate fee demands for active students in Semester ${template.semester} of this institution? Existing demands for the same academic year and semester will be skipped.`)) return;
    try {
      const res = await api.post<{ job_id: string }>('/finance/demands/bulk-generate', {
        template_id: template.template_id,
        academic_year: template.academic_year,
        semester: template.semester,
      });
      setJobId(res.job_id);
      setLastTemplateId(template.template_id);
      setJobStatus({ status: 'QUEUED', generated_count: 0 });
      setJobRefreshError(false);
      toast.success('Demand generation started. You can follow its progress below.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start demand generation');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Fee Structures & Demands"
        description="Define fee templates and generate demands for active students recorded in the selected semester."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New fee template</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Template / batch name<Input placeholder="e.g. B.Tech CSE 2026 batch" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="grid gap-1 text-sm font-medium">Academic year<Input placeholder="e.g. 2026-27" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} required /></label>
          <label className="grid gap-1 text-sm font-medium">Semester
            <select className="h-10 rounded-md border bg-white px-3 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)} required>
              <option value="">Select semester</option>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Semester {index + 1}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Total fee (₹)<Input type="number" min="0.01" step="0.01" placeholder="Enter the total fee" value={total} onChange={(e) => setTotal(e.target.value)} required /></label>
          {formError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p>}
          <div className="sm:col-span-2"><Button onClick={() => void createTemplate()}>Save template</Button></div>
        </CardContent>
      </Card>
      {templates.map((t) => (
        <Card key={t.template_id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-semibold">{t.template_name}</p>
              <p className="text-muted-foreground">
                Academic year {t.academic_year} · {t.semester ? `Semester ${t.semester}` : 'Semester not set'} · Total fee {formatInr(t.total_amount)}
              </p>
            </div>
            <Button size="sm" disabled={!t.semester || (jobStatus?.status === 'QUEUED' || jobStatus?.status === 'IN_PROGRESS')} onClick={() => void generateDemands(t)}>
              Generate demands
            </Button>
          </CardContent>
        </Card>
      ))}
      {jobId && jobStatus && (
        <Card aria-live="polite"><CardContent className="space-y-2 p-4 text-sm">
          {jobStatus.status === 'QUEUED' && <p>Your demand-generation request is waiting to start.</p>}
          {jobStatus.status === 'IN_PROGRESS' && <p>Generating demands. This may take a few minutes; the status updates automatically.</p>}
          {jobStatus.status === 'COMPLETED' && <p>Completed: {jobStatus.generated_count} new demand(s) created. {jobStatus.generated_count === 0 && 'Check whether students are recorded as active in this semester, or whether demands already exist. '}<Link href="/finance/fee-demands" className="font-semibold underline">View fee demands</Link></p>}
          {jobStatus.status === 'FAILED' && <><p role="alert">Demand generation stopped. Review existing demands before retrying; some may already have been created.</p><Button size="sm" variant="outline" onClick={() => { const template = templates.find((row) => row.template_id === lastTemplateId); if (template) void generateDemands(template); }}>Retry</Button></>}
          {jobRefreshError && <p role="status" className="text-amber-700">Status could not be refreshed. We will keep trying automatically.</p>}
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><p className="break-all">Job ID: {jobId}</p>{jobStatus.error_message && <p>{jobStatus.error_message}</p>}</details>
        </CardContent></Card>
      )}
    </div>
  );
}
