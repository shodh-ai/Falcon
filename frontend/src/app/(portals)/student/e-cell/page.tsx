'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentTabBar } from '@/components/student/StudentTabBar';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { OnboardingDocDropzone } from '@/components/student/OnboardingDocDropzone';
import { FounderWorkspaceCalendar } from '@/components/ecell/FounderWorkspaceCalendar';
import { FounderMentorConnect } from '@/components/ecell/FounderMentorConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  createEcellApi,
  ecellTrackerIndex,
  ECELL_TRACKER_STEPS,
  isFounderMode,
  type EcellFounderStatus,
  type EcellProject,
} from '@/lib/api/api.ecell';
import { cn } from '@/lib/utils';

function formatInr(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function PitchTracker({ project }: { project: EcellProject }) {
  const activeIdx = ecellTrackerIndex(project.current_status);
  const rejected = project.current_status === 'REJECTED';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-sgvu-navy">{project.startup_name}</h3>
          <p className="text-sm text-muted-foreground">
            Requested {formatInr(project.requested_funding)}
            {project.approved_funding_amount != null
              ? ` · Approved ${formatInr(project.approved_funding_amount)}`
              : ''}
          </p>
        </div>
        <Badge variant={rejected ? 'destructive' : project.current_status === 'FUNDED' ? 'default' : 'secondary'}>
          {project.current_status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {rejected ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          This pitch was rejected. You may submit again in a future cohort if applications reopen.
        </p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-5">
          {ECELL_TRACKER_STEPS.map((step, idx) => {
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

type PreFounderTab = 'pitch' | 'tracker';
type FounderTab = 'dashboard' | 'workspace' | 'mentors';

export default function StudentEcellPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [preTab, setPreTab] = useState<PreFounderTab>('pitch');
  const [founderTab, setFounderTab] = useState<FounderTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [projects, setProjects] = useState<EcellProject[]>([]);
  const [founderStatus, setFounderStatus] = useState<EcellFounderStatus | null>(null);
  const [cohortOpen, setCohortOpen] = useState(false);
  const [form, setForm] = useState({
    startup_name: '',
    innovation_description: '',
    pitch_deck_url: '',
    requested_funding: 50000,
  });

  const founderUnlocked = Boolean(founderStatus?.unlocked);
  const founderProject = founderStatus?.project;

  const load = useCallback(async () => {
    const [config, mine, founder] = await Promise.all([
      ecellApi.activeConfig(),
      ecellApi.myProjects(),
      ecellApi.founderStatus().catch(() => ({ unlocked: false, project: null })),
    ]);
    setCohortOpen(Boolean(config));
    setProjects(mine);
    setFounderStatus(founder);
    if (mine.length > 0 && !founder.unlocked) setPreTab('tracker');
  }, [ecellApi]);

  useEffect(() => {
    void load()
      .catch(() => toast.error('E-Cell hub unavailable'))
      .finally(() => setLoading(false));
  }, [load]);

  async function uploadDeck(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api.post<{ url?: string; path?: string; key?: string }>(
        '/api/uploads/single',
        body,
      );
      const pitchUrl = res.url ?? res.path ?? res.key;
      if (!pitchUrl) {
        throw new Error('Upload did not return a file reference');
      }
      setForm((f) => ({ ...f, pitch_deck_url: pitchUrl }));
      toast.success('Pitch deck uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function submitPitch() {
    if (!form.startup_name.trim() || !form.innovation_description.trim()) {
      toast.error('Startup name and innovation summary are required');
      return;
    }
    if (!form.pitch_deck_url) {
      toast.error('Please upload your pitch deck PDF');
      return;
    }
    setSubmitting(true);
    try {
      await ecellApi.submitProject({
        ...form,
        requested_funding: Number(form.requested_funding) || 0,
      });
      toast.success('Incubation pitch submitted');
      setPreTab('tracker');
      setForm({
        startup_name: '',
        innovation_description: '',
        pitch_deck_url: '',
        requested_funding: 50000,
      });
      try {
        await load();
      } catch {
        toast.warning('Pitch saved — refresh the tracker if it does not update');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit pitch');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <StudentLoadingState label="Loading E-Cell hub…" />;

  if (founderUnlocked && founderProject) {
    const activeProject =
      projects.find((p) => p.project_id === founderProject.project_id) ??
      ({ ...founderProject, innovation_description: '', requested_funding: founderProject.approved_funding_amount ?? 0 } as EcellProject);

    return (
      <StudentPageShell>
        <StudentPageHeader
          title="Founder Mode"
          description={`${founderProject.startup_name} is incubated. Book workspaces and connect with mentors to grow your startup.`}
          actions={
            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
              <Rocket className="mr-1 h-3 w-3" /> Founder Unlocked
            </Badge>
          }
        />

        <StudentTabBar
          tabs={[
            { id: 'dashboard', label: 'Founder Dashboard' },
            { id: 'workspace', label: 'Book Workspace' },
            { id: 'mentors', label: 'Mentor Connect' },
          ]}
          active={founderTab}
          onChange={(id) => setFounderTab(id as FounderTab)}
        />

        {founderTab === 'dashboard' ? (
          <Card>
            <CardContent className="pt-6">
              <PitchTracker project={activeProject} />
            </CardContent>
          </Card>
        ) : null}
        {founderTab === 'workspace' ? <FounderWorkspaceCalendar /> : null}
        {founderTab === 'mentors' ? <FounderMentorConnect /> : null}
      </StudentPageShell>
    );
  }

  return (
    <StudentPageShell>
      <StudentPageHeader
        title="E-Cell & Incubation Hub"
        description="Pitch your startup idea, track multi-tier approvals, and receive grant funding through Falcon ERP."
      />

      <StudentTabBar
        tabs={[
          { id: 'pitch', label: 'Pitch Form' },
          { id: 'tracker', label: 'Live Tracker' },
        ]}
        active={preTab}
        onChange={(id) => setPreTab(id as PreFounderTab)}
      />

      {preTab === 'pitch' ? (
        !cohortOpen ? (
          <StudentEmptyState
            title="Applications closed"
            description="No active incubation cohort is configured right now. Check back when the E-Cell opens submissions."
          />
        ) : projects.some((p) => !['REJECTED', 'FUNDED'].includes(p.current_status) && !isFounderMode(p.current_status)) ? (
          <StudentEmptyState
            title="Active pitch in progress"
            description="You already have a pitch under review. Switch to Live Tracker to follow its progress."
            action={
              <Button variant="outline" onClick={() => setPreTab('tracker')}>
                Open tracker
              </Button>
            }
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Submit Incubation Pitch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Startup Name</label>
                <Input
                  value={form.startup_name}
                  onChange={(e) => setForm((f) => ({ ...f, startup_name: e.target.value }))}
                  placeholder="e.g. AgriSense Labs"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Define Innovation (USP)</label>
                <textarea
                  className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgvu-navy/20"
                  value={form.innovation_description}
                  onChange={(e) => setForm((f) => ({ ...f, innovation_description: e.target.value }))}
                  placeholder="Explain your unique selling proposition, target market, and impact."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Project Uploading (Pitch Deck PDF)</label>
                <OnboardingDocDropzone
                  accept=".pdf,application/pdf"
                  hint="PDF only · Max 5MB"
                  fileName={form.pitch_deck_url ? 'Pitch deck ready' : null}
                  disabled={uploading}
                  onFile={(file) => void uploadDeck(file)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Define Funding (INR)</label>
                <Input
                  type="number"
                  min={1}
                  value={form.requested_funding}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, requested_funding: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <Button onClick={() => void submitPitch()} disabled={submitting || uploading}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit Pitch
              </Button>
            </CardContent>
          </Card>
        )
      ) : projects.length === 0 ? (
        <StudentEmptyState
          title="No pitches yet"
          description="Submit your first incubation pitch to see the pizza-tracker style progress bar here."
          action={
            <Button variant="outline" onClick={() => setPreTab('pitch')}>
              Open pitch form
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <Card key={project.project_id}>
              <CardContent className="pt-6">
                <PitchTracker project={project} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </StudentPageShell>
  );
}
