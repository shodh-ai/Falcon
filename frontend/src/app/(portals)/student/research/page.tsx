'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { OnboardingDocDropzone } from '@/components/student/OnboardingDocDropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  createAcademicRndApi,
  rndTrackerIndex,
  RND_TRACKER_STEPS,
  type RndApplication,
} from '@/lib/api/api.academic-rnd';
import { cn } from '@/lib/utils';

type Tab = 'apply' | 'tracker';

function formatInr(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function ApplicationTracker({ app }: { app: RndApplication }) {
  const activeIdx = rndTrackerIndex(app.status);
  const rejected = app.status.includes('REJECTED');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-sgvu-navy">{app.project_title}</h3>
          <p className="text-sm text-muted-foreground">
            {app.config_title}
            {app.requested_budget != null ? ` · Budget ${formatInr(app.requested_budget)}` : ''}
            {app.ranking_score != null ? ` · Score ${app.ranking_score}/100` : ''}
          </p>
        </div>
        <Badge variant={rejected ? 'destructive' : app.status === 'GRANT_APPROVED' ? 'default' : 'secondary'}>
          {app.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {rejected ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          This application was rejected. Check notifications for remarks from the review committee.
        </p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-4">
          {RND_TRACKER_STEPS.map((step, idx) => {
            const done = idx <= activeIdx;
            const current = idx === activeIdx;
            return (
              <li
                key={step.key}
                className={cn(
                  'rounded-xl border px-3 py-3 text-center text-xs font-semibold',
                  done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-100 bg-white text-muted-foreground',
                  current && 'ring-2 ring-sgvu-gold/40',
                )}
              >
                <span className="block text-[10px] uppercase tracking-wide opacity-70">Step {idx + 1}</span>
                {step.label}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function StudentResearchPage() {
  const api = useAuthedApi();
  const rndApi = useMemo(() => createAcademicRndApi(api), [api]);
  const [tab, setTab] = useState<Tab>('apply');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{ config_id: string; title: string; deadline?: string | null; attachment_rules: string[] } | null>(null);
  const [applications, setApplications] = useState<RndApplication[]>([]);
  const [form, setForm] = useState({
    project_title: '',
    requested_budget: 25000,
    proposal_url: '',
    budget_url: '',
  });

  const load = useCallback(async () => {
    const [cfg, mine] = await Promise.all([rndApi.activeConfig(), rndApi.myApplications()]);
    setOpen(Boolean(cfg));
    setConfig(cfg);
    setApplications(mine);
    if (mine.length > 0) setTab('tracker');
  }, [rndApi]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function onUpload(file: File, field: 'proposal_url' | 'budget_url') {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ url: string }>('/api/uploads', fd);
      setForm((f) => ({ ...f, [field]: res.url }));
      toast.success('Document uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    try {
      await rndApi.submitApplication({
        config_id: config.config_id,
        project_title: form.project_title,
        requested_budget: form.requested_budget,
        documents: {
          proposal: form.proposal_url,
          budget_estimate: form.budget_url,
        },
      });
      toast.success('Research grant application submitted');
      setForm({ project_title: '', requested_budget: 25000, proposal_url: '', budget_url: '' });
      await load();
      setTab('tracker');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <StudentLoadingState label="Loading research grants…" />;

  return (
    <StudentPageShell width="4xl">
      <StudentPageHeader
        title="Student Research Grants"
        description="Apply for undergraduate research funding — distinct from E-Cell startup incubation."
      />

      <StudentTabBar
        tabs={[
          { id: 'apply', label: 'Apply' },
          { id: 'tracker', label: 'My Applications' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'apply' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sgvu-navy">
              {open && config ? config.title : 'No active grant call'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!open || !config ? (
              <StudentEmptyState
                title="Applications closed"
                description="IQAC will publish the next research grant call on the Notice Board."
              />
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                {config.deadline && (
                  <p className="text-sm text-muted-foreground">
                    Deadline: {new Date(config.deadline).toLocaleString('en-IN')}
                  </p>
                )}
                <Input
                  placeholder="Project title"
                  value={form.project_title}
                  onChange={(e) => setForm((f) => ({ ...f, project_title: e.target.value }))}
                  required
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Requested budget (INR)"
                  value={form.requested_budget}
                  onChange={(e) => setForm((f) => ({ ...f, requested_budget: Number(e.target.value) }))}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <OnboardingDocDropzone
                    label="Research Proposal (PDF)"
                    accept=".pdf"
                    disabled={uploading}
                    onFile={(file) => void onUpload(file, 'proposal_url')}
                  />
                  <OnboardingDocDropzone
                    label="Budget Estimate (PDF)"
                    accept=".pdf"
                    disabled={uploading}
                    onFile={(file) => void onUpload(file, 'budget_url')}
                  />
                </div>
                <Button type="submit" disabled={submitting || !form.proposal_url || !form.budget_url}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit Application
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'tracker' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <StudentEmptyState title="No applications yet" description="Submit a research grant application when a call is open." />
          ) : (
            applications.map((app) => (
              <Card key={app.application_id}>
                <CardContent className="pt-6">
                  <ApplicationTracker app={app} />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </StudentPageShell>
  );
}
