'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHrApi } from '@/lib/api/use-hr-api';

type Step = { step_key: string; step_label: string; status: string };
type ProgressData = {
  is_new_hire: boolean;
  progress_percent: number;
  pipeline: { pipeline_id: string } | null;
  steps: Step[];
};

export default function EssOnboardingPage() {
  const api = useHrApi();
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    void api.get<ProgressData>('/api/hr/ess/onboarding/progress').then(setData);
  }, [api]);

  async function complete(stepKey: string) {
    if (!data?.pipeline?.pipeline_id) return;
    await api.patch(`/api/hr/ess/onboarding/steps/${stepKey}`, { pipeline_id: data.pipeline.pipeline_id });
    setData(await api.get<ProgressData>('/api/hr/ess/onboarding/progress'));
  }

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  if (!data.is_new_hire) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <h2 className="text-2xl font-bold text-sgvu-navy">Onboarding Documents</h2>
        <p className="text-sm text-muted-foreground">Your joining kit is available in the Document Vault.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Onboarding Progress</h2>
        <Progress value={data.progress_percent} className="mt-4 h-3" />
        <p className="mt-2 text-sm text-muted-foreground">{data.progress_percent}% complete</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.steps.map((step) => (
            <div key={step.step_key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                {step.status === 'COMPLETED' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                {step.step_label}
              </div>
              {step.status !== 'COMPLETED' && (
                <Button size="sm" variant="outline" onClick={() => void complete(step.step_key)}>
                  Mark done
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
