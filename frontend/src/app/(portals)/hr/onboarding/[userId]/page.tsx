'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { OnboardingWorkflowPanel, type OnboardingWorkflow } from '@/components/hr/OnboardingWorkflowPanel';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

export default function HrOnboardingEmployeePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const api = useHrApi();
  const { entityReady, loading: entityLoading } = useHrEntity();
  const [workflow, setWorkflow] = useState<OnboardingWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityReady || !userId) return;
    setLoading(true);
    setError(null);
    void api
      .get<OnboardingWorkflow>(`/api/hr/onboarding/${userId}`)
      .then(setWorkflow)
      .catch((e: unknown) => {
        setWorkflow(null);
        setError(e instanceof Error ? e.message : 'Failed to load onboarding workflow');
      })
      .finally(() => setLoading(false));
  }, [api, entityReady, userId]);

  if (entityLoading || loading) {
    return <FalconLoader label="Loading onboarding workflow…" />;
  }

  if (error || !workflow) {
    return (
      <div className="space-y-4">
        <Link href="/hr/onboarding" className="inline-flex items-center gap-2 text-sm font-medium text-sgvu-navy hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to New Hires
        </Link>
        <p className="text-sm text-red-600">{error ?? 'Workflow not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/hr/onboarding" className="inline-flex items-center gap-2 text-sm font-medium text-sgvu-navy hover:underline">
        <ArrowLeft className="h-4 w-4" />
        Back to New Hires
      </Link>
      <OnboardingWorkflowPanel workflow={workflow} onUpdate={setWorkflow} />
    </div>
  );
}
