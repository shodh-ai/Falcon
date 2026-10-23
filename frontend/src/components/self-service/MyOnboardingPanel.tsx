'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { SelfServiceLoadError } from './SelfServiceLoadError';

type Step = { step_key: string; step_label: string; status: string };
type ProgressData = {
  is_new_hire: boolean;
  progress_percent: number;
  pipeline: { pipeline_id: string } | null;
  steps: Step[];
};

export function MyOnboardingPanel() {
  const api = useAuthedApi();
  const [scope, setScope] = useState({ api, revision: 0 });
  if (scope.api !== api) setScope({ api, revision: scope.revision + 1 });
  return <MyOnboardingWorkspace key={scope.revision} api={api} />;
}

function MyOnboardingWorkspace({ api }: { api: ReturnType<typeof useAuthedApi> }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void api.get<ProgressData>('/api/hr/ess/onboarding/progress')
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Could not load onboarding progress.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, retry]);

  async function complete(stepKey: string) {
    if (!data?.pipeline?.pipeline_id || savingStep) return;
    setSavingStep(stepKey);
    setError(null);
    try {
      await api.patch(`/api/hr/ess/onboarding/steps/${encodeURIComponent(stepKey)}`, { pipeline_id: data.pipeline.pipeline_id });
      setData(await api.get<ProgressData>('/api/hr/ess/onboarding/progress'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update onboarding progress.');
    } finally {
      setSavingStep(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading onboarding…</p>;
  if (error) return <SelfServiceLoadError message={error} onRetry={() => { setLoading(true); setError(null); setRetry((n) => n + 1); }} />;
  if (!data) return null;

  if (!data.is_new_hire) {
    return (
      <p className="text-sm text-muted-foreground">
        No onboarding checklist is assigned to your account. Contact HR if you are awaiting one.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Progress value={data.progress_percent} className="h-3" />
      <p className="text-sm text-muted-foreground">{data.progress_percent}% complete</p>
      {data.steps.map((step) => (
        <Card key={step.step_key}>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              {['COMPLETED', 'DONE'].includes(step.status) ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
              {step.step_label}
            </CardTitle>
            {!['COMPLETED', 'DONE'].includes(step.status) && (
              <Button size="sm" variant="outline" disabled={savingStep !== null} onClick={() => void complete(step.step_key)}>
                {savingStep === step.step_key ? 'Saving…' : 'Mark done'}
              </Button>
            )}
          </CardHeader>
          {['COMPLETED', 'DONE'].includes(step.status) && (
            <CardContent className="pt-0 text-xs text-muted-foreground">Completed</CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
