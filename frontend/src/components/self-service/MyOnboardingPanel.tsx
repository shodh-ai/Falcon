'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Step = { step_key: string; step_label: string; status: string };
type ProgressData = {
  is_new_hire: boolean;
  progress_percent: number;
  pipeline: { pipeline_id: string } | null;
  steps: Step[];
};

export function MyOnboardingPanel() {
  const api = useAuthedApi();
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    void api.get<ProgressData>('/api/hr/ess/onboarding/progress').then(setData);
  }, [api]);

  async function complete(stepKey: string) {
    if (!data?.pipeline?.pipeline_id) return;
    await api.patch(`/api/hr/ess/onboarding/steps/${stepKey}`, { pipeline_id: data.pipeline.pipeline_id });
    setData(await api.get<ProgressData>('/api/hr/ess/onboarding/progress'));
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!data.is_new_hire) {
    return (
      <p className="text-sm text-muted-foreground">
        Your joining kit is available in the Document Vault.
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
              {step.status === 'DONE' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
              {step.step_label}
            </CardTitle>
            {step.status !== 'DONE' && (
              <Button size="sm" variant="outline" onClick={() => void complete(step.step_key)}>
                Mark done
              </Button>
            )}
          </CardHeader>
          {step.status === 'DONE' && (
            <CardContent className="pt-0 text-xs text-muted-foreground">Completed</CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
